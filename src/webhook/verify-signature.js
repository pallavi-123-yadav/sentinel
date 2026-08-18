const crypto = require('crypto');

/**
 * Verifies a GitHub webhook's `X-Hub-Signature-256` header against the raw
 * request body — this is what proves a request actually came from GitHub
 * (using the shared secret configured on the webhook) rather than from
 * anyone who finds the URL.
 *
 * Must be checked against the *raw* bytes, not the re-serialized JSON body —
 * re-stringifying can differ from what GitHub actually signed (key order,
 * whitespace), which would make every request fail verification.
 */
function verifySignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signatureHeader);

  // timingSafeEqual throws if lengths differ, so check that first — this
  // early return is safe because it only leaks the *length* of a valid
  // signature, which is fixed and public (always a hex sha256 digest).
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

module.exports = { verifySignature };
