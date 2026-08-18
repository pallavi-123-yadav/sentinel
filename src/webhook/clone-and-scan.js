const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const { runScan } = require('../scanner/secret-scanner');
const { checkPackages } = require('../scanner/package-checker');
const { formatReport } = require('../scanner/ci-report');
const { relativizeFindings } = require('./relativize-findings');

/**
 * Clones a single branch of a repo at shallow depth into a throwaway temp
 * directory, runs the full Guardian scan against it, and returns the
 * rendered report — cleaning up the clone afterward either way.
 *
 * Unlike GitHub Actions (which gets a free checkout of the exact commit
 * being tested), a webhook server only receives the payload — it has to go
 * get the code itself before there's anything to scan.
 *
 * Uses execFile (argument array, no shell) rather than exec/string
 * interpolation, so nothing in the ref/owner/repo values — even though
 * they've already passed signature verification — can be interpreted as
 * shell syntax.
 */
async function cloneAndScan({ owner, repo, ref, token }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-webhook-'));
  const authedUrl = token
    ? `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;

  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--branch', ref, authedUrl, tmpDir]);

    const secretAndAuthFindings = runScan(tmpDir);
    const { findings: packageFindings, unverified } = await checkPackages(tmpDir);
    const allFindings = relativizeFindings([...secretAndAuthFindings, ...packageFindings], tmpDir);

    const report = formatReport(allFindings, unverified, `${owner}/${repo}@${ref}`);
    const hasCritical = allFindings.some(
      (f) => f.severity === 'CRITICAL' && (f.confidence ?? 1) >= 0.5
    );

    return { report, hasCritical, findingCount: allFindings.length };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { cloneAndScan };
