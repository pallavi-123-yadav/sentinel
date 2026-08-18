// Which pull_request actions are worth re-scanning for. Every other action
// (closed, labeled, assigned, ...) doesn't change the code, so there's
// nothing new to catch.
const SCANNABLE_PR_ACTIONS = new Set(['opened', 'reopened', 'synchronize']);

/**
 * Turns a raw GitHub webhook delivery (event name + JSON payload) into a
 * plain description of what Guardian should do with it, or `{ type:
 * 'ignored' }` if there's nothing to scan. Kept separate from the Express
 * route and from git/network I/O so the branching logic can be unit tested
 * directly against sample payloads.
 */
function describeScanTarget(eventName, payload) {
  if (eventName === 'ping') {
    return { type: 'ping' };
  }

  if (eventName === 'pull_request' && payload?.pull_request && payload?.repository) {
    if (!SCANNABLE_PR_ACTIONS.has(payload.action)) {
      return { type: 'ignored', reason: `unhandled pull_request action "${payload.action}"` };
    }
    return {
      type: 'pull_request',
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      ref: payload.pull_request.head.ref,
      sha: payload.pull_request.head.sha,
      prNumber: payload.pull_request.number
    };
  }

  if (eventName === 'push' && payload?.repository) {
    if (payload.deleted) {
      return { type: 'ignored', reason: 'branch deletion push' };
    }
    const ref = (payload.ref || '').replace(/^refs\/heads\//, '');
    if (ref !== payload.repository.default_branch) {
      return { type: 'ignored', reason: `push to non-default branch "${ref}"` };
    }
    return {
      type: 'push',
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      ref,
      sha: payload.after
    };
  }

  return { type: 'ignored', reason: `unsupported event "${eventName}"` };
}

module.exports = { describeScanTarget, SCANNABLE_PR_ACTIONS };
