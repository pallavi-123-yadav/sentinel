#!/usr/bin/env node
/**
 * Runs all Guardian checks (secrets, missing-auth, hallucinated packages)
 * against a target folder and prints one combined Markdown report — meant
 * to be posted as a GitHub PR comment from CI.
 *
 * Usage: node src/scanner/ci-report.js [targetDir]
 */

const path = require('path');
const { runScan } = require('./secret-scanner');
const { checkPackages } = require('./package-checker');

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEVERITY_EMOJI = {
  CRITICAL: '\u{1F6A8}',
  HIGH: '\u{26A0}\u{FE0F}',
  MEDIUM: '\u{1F7E1}',
  LOW: '\u{1F535}'
};

function codeSafe(text) {
  return String(text).replace(/`/g, "'");
}

function formatReport(findings, unverified, targetDir) {
  const lines = [];
  lines.push('## \u{1F6E1}\u{FE0F} Guardian Security Scan');
  lines.push('');

  if (findings.length === 0) {
    lines.push(`No issues found in \`${targetDir}\`.`);
  } else {
    const sorted = [...findings].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
    const counts = sorted.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(', ');

    lines.push(`**${sorted.length} issue(s) found** — ${summary}`);
    lines.push('');

    for (const finding of sorted) {
      const emoji = SEVERITY_EMOJI[finding.severity] || '';
      const relFile = path.relative(process.cwd(), finding.file);
      const location = finding.line ? `${relFile}:${finding.line}` : relFile;
      lines.push(`- ${emoji} **[${finding.severity}] ${finding.label}**`);
      lines.push(`  \`${location}\``);
      if (finding.snippet) {
        lines.push(`  \`\`\``);
        lines.push(`  ${codeSafe(finding.snippet)}`);
        lines.push(`  \`\`\``);
      }
    }
  }

  if (unverified.length > 0) {
    lines.push('');
    lines.push(
      `<details><summary>${unverified.length} package(s) could not be verified (network/registry issue)</summary>`
    );
    lines.push('');
    for (const { pkg, error } of unverified) {
      lines.push(`- ${pkg.name} (${pkg.ecosystem}): ${codeSafe(error)}`);
    }
    lines.push('</details>');
  }

  lines.push('');
  lines.push(
    '_Guardian scans for hardcoded secrets, missing auth checks, and hallucinated packages. It is not a substitute for a full security review._'
  );

  return lines.join('\n');
}

async function main() {
  const targetDir = process.argv[2] || '.';
  const resolved = path.resolve(targetDir);

  const secretAndAuthFindings = runScan(resolved);
  const { findings: packageFindings, unverified } = await checkPackages(resolved);

  const allFindings = [...secretAndAuthFindings, ...packageFindings];
  const report = formatReport(allFindings, unverified, targetDir);

  console.log(report);

  const hasCritical = allFindings.some((f) => f.severity === 'CRITICAL');
  process.exitCode = hasCritical ? 1 : 0;
}

main();
