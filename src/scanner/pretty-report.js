/**
 * Plain-text (non-Markdown) renderer for the combined secrets + missing-auth
 * + hallucinated-package report — what a human sees when they run the CLI
 * directly in a terminal, as opposed to formatReport's Markdown output for
 * GitHub PR comments.
 */

const path = require('path');
const { buildReportData } = require('./report-data');

function formatPrettyReport(findings, unverified, targetDir, reportOptions = {}) {
  const { confident, lowConfidence } = buildReportData(findings, unverified, reportOptions);
  const lines = [];

  lines.push(`Guardian scan: ${targetDir}`);
  lines.push('');

  if (confident.length === 0) {
    lines.push('No issues found.');
  } else {
    for (const finding of confident) {
      const relFile = path.relative(process.cwd(), finding.file);
      const location = finding.line ? `${relFile}:${finding.line}` : relFile;
      const confidencePct = Math.round((finding.confidence ?? 1) * 100);
      lines.push(`[${finding.severity}] ${finding.label} (confidence: ${confidencePct}%)`);
      lines.push(`  ${location}`);
      if (finding.snippet) lines.push(`  ${finding.snippet}`);
      lines.push('');
    }

    const counts = confident.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(', ');
    lines.push(`Total: ${confident.length} issue(s) — ${summary}`);
  }

  if (lowConfidence.length > 0) {
    lines.push('');
    lines.push(
      `${lowConfidence.length} low-confidence finding(s) not shown above (rerun with --min-confidence 0 to see them):`
    );
    for (const finding of lowConfidence) {
      const relFile = path.relative(process.cwd(), finding.file);
      const location = finding.line ? `${relFile}:${finding.line}` : relFile;
      const confidencePct = Math.round(finding.confidence * 100);
      lines.push(
        `  - [${finding.severity}] ${finding.label} — ${location} (confidence ${confidencePct}%)`
      );
    }
  }

  if (unverified.length > 0) {
    lines.push('');
    lines.push(`${unverified.length} package(s) could not be verified (network/registry issue):`);
    for (const { pkg, error } of unverified) {
      lines.push(`  - ${pkg.name} (${pkg.ecosystem}): ${error}`);
    }
  }

  return lines.join('\n');
}

module.exports = { formatPrettyReport };
