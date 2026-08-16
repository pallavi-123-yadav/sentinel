#!/usr/bin/env node
/**
 * Guardian hallucinated-package checker.
 * Reads dependency manifests (package.json, requirements.txt) and checks
 * each package name against the real npm/PyPI registries, flagging names
 * that don't actually exist — a known AI-coding failure mode where the
 * model invents a plausible-sounding package that was never published.
 *
 * Usage: node src/scanner/package-checker.js [targetDir]
 */

const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const REGISTRY_TIMEOUT_MS = 6000;

// --- Manifest discovery -------------------------------------------------

function findManifests(dir, results = { npm: [], pip: [] }) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      findManifests(path.join(dir, entry.name), results);
    } else if (entry.isFile()) {
      if (entry.name === 'package.json') results.npm.push(path.join(dir, entry.name));
      if (entry.name === 'requirements.txt') results.pip.push(path.join(dir, entry.name));
    }
  }
  return results;
}

// --- Manifest parsing -----------------------------------------------------

function parseNpmManifest(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const packages = [];
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = parsed[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const name of Object.keys(deps)) {
      packages.push({ name, ecosystem: 'npm', field, file: filePath });
    }
  }
  return packages;
}

// Strips a requirements.txt line down to a bare package name, e.g.
// "flask>=2.0.1  # web framework" -> "flask". Returns null for lines that
// aren't a plain "name==version" style requirement (editable installs, git
// URLs, -r includes, comments, blank lines).
function parsePipRequirementLine(line) {
  const trimmed = line.split('#')[0].trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('-')) return null; // -e, -r, --index-url, etc.
  if (/^[a-zA-Z0-9._-]+:\/\//.test(trimmed)) return null; // raw URLs
  if (trimmed.includes('@') && trimmed.includes('git+')) return null;

  const nameMatch = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
  return nameMatch ? nameMatch[1] : null;
}

function parsePipManifest(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const packages = [];
  for (const line of content.split('\n')) {
    const name = parsePipRequirementLine(line);
    if (name) packages.push({ name, ecosystem: 'pip', field: 'requirements.txt', file: filePath });
  }
  return packages;
}

// --- Registry lookups -----------------------------------------------------

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkNpmPackageExists(name) {
  const encoded = name.startsWith('@') ? name.replace('/', '%2F') : encodeURIComponent(name);
  const url = `https://registry.npmjs.org/${encoded}`;
  try {
    const res = await fetchWithTimeout(url);
    if (res.status === 200) return { exists: true };
    if (res.status === 404) return { exists: false };
    return { exists: null, error: `registry returned HTTP ${res.status}` };
  } catch (err) {
    return { exists: null, error: err.message };
  }
}

async function checkPipPackageExists(name) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
  try {
    const res = await fetchWithTimeout(url);
    if (res.status === 200) return { exists: true };
    if (res.status === 404) return { exists: false };
    return { exists: null, error: `registry returned HTTP ${res.status}` };
  } catch (err) {
    return { exists: null, error: err.message };
  }
}

// --- Orchestration ---------------------------------------------------------

async function checkPackages(targetDir) {
  const manifests = findManifests(targetDir);

  const npmPackages = manifests.npm.flatMap(parseNpmManifest);
  const pipPackages = manifests.pip.flatMap(parsePipManifest);

  const uniqueNpm = dedupeByName(npmPackages);
  const uniquePip = dedupeByName(pipPackages);

  const [npmResults, pipResults] = await Promise.all([
    Promise.all(
      uniqueNpm.map(async (pkg) => ({ pkg, result: await checkNpmPackageExists(pkg.name) }))
    ),
    Promise.all(
      uniquePip.map(async (pkg) => ({ pkg, result: await checkPipPackageExists(pkg.name) }))
    )
  ]);

  const findings = [];
  const unverified = [];

  for (const { pkg, result } of [...npmResults, ...pipResults]) {
    if (result.exists === false) {
      findings.push({
        type: 'hallucinated-package',
        id: 'hallucinated-package',
        label: `Package "${pkg.name}" does not exist on ${pkg.ecosystem === 'npm' ? 'npm' : 'PyPI'} — likely AI-hallucinated`,
        severity: 'CRITICAL',
        file: pkg.file,
        line: null,
        snippet: `${pkg.field}: "${pkg.name}"`
      });
    } else if (result.exists === null) {
      unverified.push({ pkg, error: result.error });
    }
  }

  return { findings, unverified };
}

function dedupeByName(packages) {
  const seen = new Map();
  for (const pkg of packages) {
    const key = `${pkg.ecosystem}:${pkg.name}`;
    if (!seen.has(key)) seen.set(key, pkg);
  }
  return [...seen.values()];
}

// --- Report ------------------------------------------------------------

function printReport(targetDir, { findings, unverified }) {
  console.log(`\nGuardian package check: ${targetDir}\n`);

  if (findings.length === 0) {
    console.log('No hallucinated packages found.\n');
  } else {
    for (const finding of findings) {
      const relFile = path.relative(process.cwd(), finding.file);
      console.log(`[${finding.severity}] ${finding.label}`);
      console.log(`  ${relFile}`);
      console.log(`  ${finding.snippet}`);
      console.log('');
    }
    console.log(`Total: ${findings.length} hallucinated package(s)\n`);
  }

  if (unverified.length > 0) {
    console.log(`Could not verify ${unverified.length} package(s) (network/registry issue):`);
    for (const { pkg, error } of unverified) {
      console.log(`  - ${pkg.name} (${pkg.ecosystem}): ${error}`);
    }
    console.log('');
  }
}

if (require.main === module) {
  const targetDir = process.argv[2] || path.join(__dirname, '..', '..', 'sample-app');
  const resolved = path.resolve(targetDir);
  checkPackages(resolved).then((report) => {
    printReport(resolved, report);
    process.exit(report.findings.length > 0 ? 1 : 0);
  });
}

module.exports = {
  checkPackages,
  parseNpmManifest,
  parsePipManifest,
  parsePipRequirementLine,
  checkNpmPackageExists,
  checkPipPackageExists
};
