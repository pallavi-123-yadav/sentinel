#!/usr/bin/env node
/**
 * Guardian secret + missing-auth scanner.
 * Usage: node src/scanner/secret-scanner.js [targetDir]
 */

const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const SCANNABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.java',
  '.php',
  '.env',
  '.yml',
  '.yaml',
  '.json'
]);

// --- Secret patterns -------------------------------------------------

const SECRET_PATTERNS = [
  {
    id: 'aws-access-key-id',
    label: 'AWS Access Key ID',
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: 'CRITICAL'
  },
  {
    id: 'aws-secret-access-key',
    label: 'AWS Secret Access Key',
    regex: /aws(.{0,20})?(secret|access)?.{0,3}key.{0,3}[:=]\s*["'][0-9a-zA-Z/+]{40}["']/gi,
    severity: 'CRITICAL'
  },
  {
    id: 'stripe-live-key',
    label: 'Stripe Live Secret Key',
    regex: /sk_live_[0-9a-zA-Z]{20,}/g,
    severity: 'CRITICAL'
  },
  {
    id: 'stripe-test-key',
    label: 'Stripe Test Secret Key',
    regex: /sk_test_[0-9a-zA-Z]{20,}/g,
    severity: 'LOW'
  },
  {
    id: 'github-token',
    label: 'GitHub Personal Access Token',
    regex: /gh[pousr]_[0-9A-Za-z]{36,}/g,
    severity: 'CRITICAL'
  },
  {
    id: 'slack-webhook',
    label: 'Slack Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g,
    severity: 'HIGH'
  },
  {
    id: 'private-key-block',
    label: 'Private Key Block',
    regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'CRITICAL'
  },
  {
    id: 'generic-jwt-secret',
    label: 'Hardcoded JWT Secret',
    regex: /jwt[_-]?secret\s*[:=]\s*["'][^"']{6,}["']/gi,
    severity: 'HIGH'
  },
  {
    id: 'generic-hardcoded-secret',
    label: 'Hardcoded Password/Secret/API Key',
    regex:
      /(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token)\s*[:=]\s*["']([^"']{8,})["']/gi,
    severity: 'HIGH'
  }
];

// Values that are obviously placeholders, not real secrets.
const PLACEHOLDER_VALUE =
  /^(process\.env|<|\$\{|your[_-]|example|changeme|xxxx|placeholder|test|dummy)/i;

function isLikelyPlaceholder(matchedText) {
  const valueMatch = matchedText.match(/["']([^"']+)["']\s*$/);
  const value = valueMatch ? valueMatch[1] : matchedText;
  return PLACEHOLDER_VALUE.test(value);
}

function scanFileForSecrets(filePath, content) {
  const findings = [];
  const lines = content.split('\n');

  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex since these regexes are reused with the /g flag.
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      const matchedText = match[0];
      if (isLikelyPlaceholder(matchedText)) continue;

      const upToMatch = content.slice(0, match.index);
      const lineNumber = upToMatch.split('\n').length;
      const lineText = lines[lineNumber - 1] ? lines[lineNumber - 1].trim() : matchedText.trim();

      findings.push({
        type: 'secret',
        id: pattern.id,
        label: pattern.label,
        severity: pattern.severity,
        file: filePath,
        line: lineNumber,
        snippet: truncate(lineText, 120)
      });
    }
  }

  return findings;
}

// --- Missing auth-check detector (Express-style routes) --------------

// Matches both `app.get(...)` and `router.get(...)` — real Express apps
// almost always define routes on a Router, not directly on `app`.
const ROUTE_REGEX = /\b(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]\s*,/g;

const AUTH_KEYWORDS = [
  'authorization',
  'req.user',
  'requireauth',
  'isauthenticated',
  'verifytoken',
  'jwt.verify',
  'passport',
  'req.session',
  'ensureauth',
  'checkauth',
  '401'
];

const SENSITIVE_PATH_HINTS =
  /admin|user|account|profile|payment|billing|delete|order|settings|token|secret/i;

// `app.use(...)` / `router.use(...)` calls that are known NOT to be auth
// middleware, so they don't count as a coverage boundary.
const NON_AUTH_MIDDLEWARE =
  /^(express\.(json|urlencoded|static|raw|text)|cors|helmet|morgan|compression|cookieparser|bodyparser|multer)\s*\(/i;

const USE_CALL_REGEX = /\b(?:app|router)\.use\s*\(\s*([^)]*)\)/g;

// A handler that starts immediately after the route path (no extra
// identifier in between) — `(req, res) => {...}` or `function (req, res) {...}`.
const HANDLER_STARTS_IMMEDIATELY = /^\s*(async\s+)?(\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/;
const HANDLER_STARTS_WITH_FUNCTION_KEYWORD = /^\s*(async\s+)?function\b/;

function extractHandlerBody(content, startIndex) {
  const braceStart = content.indexOf('{', startIndex);
  if (braceStart === -1) return content.slice(startIndex, startIndex + 300);

  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(braceStart, i + 1);
      }
    }
  }
  return content.slice(braceStart, Math.min(content.length, braceStart + 500));
}

// Returns true if there's an identifier (presumably middleware, e.g.
// `requireAuth`) between the route path and the handler function itself —
// `app.get(path, requireAuth, (req, res) => {...})`. We can't tell whether
// that middleware checks auth, so we treat its presence as "can't say this
// route is unprotected" rather than risk a false positive.
function hasInlineMiddlewareArg(content, startIndex) {
  const braceStart = content.indexOf('{', startIndex);
  const searchEnd = braceStart === -1 ? Math.min(content.length, startIndex + 200) : braceStart;
  const argsText = content.slice(startIndex, searchEnd);
  return (
    !HANDLER_STARTS_IMMEDIATELY.test(argsText) &&
    !HANDLER_STARTS_WITH_FUNCTION_KEYWORD.test(argsText)
  );
}

// Finds file offsets of `app.use(...)`/`router.use(...)` calls that register
// something other than a known non-auth middleware. Any route defined after
// one of these offsets is treated as potentially covered by that middleware.
function getAuthMiddlewareBoundaries(content) {
  const boundaries = [];
  USE_CALL_REGEX.lastIndex = 0;
  let match;
  while ((match = USE_CALL_REGEX.exec(content)) !== null) {
    const arg = match[1].trim();
    if (!arg || NON_AUTH_MIDDLEWARE.test(arg)) continue;
    boundaries.push(match.index);
  }
  return boundaries;
}

function scanFileForMissingAuth(filePath, content) {
  const findings = [];
  if (!/\b(?:app|router)\.(get|post|put|delete|patch)\s*\(/.test(content)) return findings;

  const authMiddlewareBoundaries = getAuthMiddlewareBoundaries(content);

  ROUTE_REGEX.lastIndex = 0;
  let match;
  while ((match = ROUTE_REGEX.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];

    const coveredByUpstreamMiddleware = authMiddlewareBoundaries.some((b) => b < match.index);
    if (coveredByUpstreamMiddleware) continue;

    if (hasInlineMiddlewareArg(content, ROUTE_REGEX.lastIndex)) continue;

    const handlerBody = extractHandlerBody(content, ROUTE_REGEX.lastIndex);
    const bodyLower = handlerBody.toLowerCase();

    const hasAuthCheck = AUTH_KEYWORDS.some((kw) => bodyLower.includes(kw));
    if (hasAuthCheck) continue;

    const looksSensitive = SENSITIVE_PATH_HINTS.test(routePath) || method !== 'GET';
    if (!looksSensitive) continue;

    const upToMatch = content.slice(0, match.index);
    const lineNumber = upToMatch.split('\n').length;

    findings.push({
      type: 'missing-auth',
      id: 'missing-auth-check',
      label: `Route ${method} ${routePath} has no visible auth check`,
      severity: method === 'GET' ? 'MEDIUM' : 'HIGH',
      file: filePath,
      line: lineNumber,
      snippet: `${match[0].split('.')[0]}.${match[1]}('${routePath}', ...)`
    });
  }

  return findings;
}

// --- File walking ------------------------------------------------------

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// --- Report --------------------------------------------------------

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function printReport(findings, targetDir) {
  console.log(`\nGuardian scan: ${targetDir}\n`);

  if (findings.length === 0) {
    console.log('No issues found.\n');
    return;
  }

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  for (const finding of sorted) {
    const relFile = path.relative(process.cwd(), finding.file);
    console.log(`[${finding.severity}] ${finding.label}`);
    console.log(`  ${relFile}:${finding.line}`);
    console.log(`  ${finding.snippet}`);
    console.log('');
  }

  const counts = sorted.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const summary = Object.entries(counts)
    .map(([sev, count]) => `${count} ${sev}`)
    .join(', ');

  console.log(`Total: ${sorted.length} issue(s) — ${summary}\n`);
}

// --- Entry point --------------------------------------------------------

function runScan(targetDir) {
  const resolved = path.resolve(targetDir);
  if (!fs.existsSync(resolved)) {
    console.error(`Target directory does not exist: ${resolved}`);
    process.exit(1);
  }

  const files = walk(resolved);
  const findings = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    findings.push(...scanFileForSecrets(file, content));
    findings.push(...scanFileForMissingAuth(file, content));
  }

  return findings;
}

if (require.main === module) {
  const targetDir = process.argv[2] || path.join(__dirname, '..', '..', 'sample-app');
  const findings = runScan(targetDir);
  printReport(findings, path.resolve(targetDir));
  process.exit(findings.some((f) => f.severity === 'CRITICAL') ? 1 : 0);
}

module.exports = { runScan, scanFileForSecrets, scanFileForMissingAuth, walk };
