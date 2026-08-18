const path = require('path');

/**
 * Rewrites each finding's absolute file path (inside a throwaway clone
 * directory) to a clean path relative to that clone's root, e.g.
 * `/tmp/guardian-webhook-xyz/src/app.js` -> `src/app.js` — so the report
 * posted on the PR shows real repo-relative paths instead of a local temp
 * directory nobody but the server can see.
 */
function relativizeFindings(findings, baseDir) {
  return findings.map((finding) => ({ ...finding, file: path.relative(baseDir, finding.file) }));
}

module.exports = { relativizeFindings };
