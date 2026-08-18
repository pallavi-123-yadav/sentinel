/**
 * Turns a raw findings list into the shape every report renderer (markdown,
 * pretty-printed terminal, JSON) needs: sorted by severity, split into
 * "confident enough to act on" vs "low-confidence, review manually", plus
 * whether anything should fail a CI check.
 */

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Findings below this confidence are reported separately rather than in the
// main list, and can't fail a CI check on their own — regex-based detection
// is noisy enough that a low-confidence match (test fixtures, demo dirs, the
// loose generic-secret pattern) shouldn't block a PR by itself.
const CONFIDENCE_THRESHOLD = 0.5;

function buildReportData(findings, unverified, { minConfidence = CONFIDENCE_THRESHOLD } = {}) {
  const confident = [...findings]
    .filter((f) => (f.confidence ?? 1) >= minConfidence)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const lowConfidence = findings.filter((f) => (f.confidence ?? 1) < minConfidence);
  const hasCritical = confident.some((f) => f.severity === 'CRITICAL');

  return { confident, lowConfidence, unverified, hasCritical };
}

module.exports = { buildReportData, SEVERITY_ORDER, CONFIDENCE_THRESHOLD };
