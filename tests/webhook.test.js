const crypto = require('crypto');
const path = require('path');

const { verifySignature } = require('../src/webhook/verify-signature');
const { describeScanTarget } = require('../src/webhook/parse-event');
const { relativizeFindings } = require('../src/webhook/relativize-findings');
const { postComment } = require('../src/webhook/post-comment');

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifySignature', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));

  test('accepts a correctly signed body', () => {
    expect(verifySignature(body, sign(body, secret), secret)).toBe(true);
  });

  test('rejects a body signed with the wrong secret', () => {
    expect(verifySignature(body, sign(body, 'wrong-secret'), secret)).toBe(false);
  });

  test('rejects a tampered body that no longer matches its signature', () => {
    const signature = sign(body, secret);
    const tamperedBody = Buffer.from(JSON.stringify({ hello: 'tampered' }));
    expect(verifySignature(tamperedBody, signature, secret)).toBe(false);
  });

  test('rejects a missing signature header', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });

  test('rejects a signature missing the sha256= prefix', () => {
    const raw = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifySignature(body, raw, secret)).toBe(false);
  });

  test('rejects when the server has no secret configured', () => {
    expect(verifySignature(body, sign(body, secret), undefined)).toBe(false);
  });
});

describe('describeScanTarget', () => {
  test('a ping event is acknowledged without scanning anything', () => {
    expect(describeScanTarget('ping', {})).toEqual({ type: 'ping' });
  });

  test('an opened pull_request is scanned', () => {
    const target = describeScanTarget('pull_request', {
      action: 'opened',
      pull_request: { head: { ref: 'feature-branch', sha: 'abc123' }, number: 7 },
      repository: { owner: { login: 'octocat' }, name: 'hello-world' }
    });
    expect(target).toEqual({
      type: 'pull_request',
      owner: 'octocat',
      repo: 'hello-world',
      ref: 'feature-branch',
      sha: 'abc123',
      prNumber: 7
    });
  });

  test('a closed pull_request is ignored (nothing new to scan)', () => {
    const target = describeScanTarget('pull_request', {
      action: 'closed',
      pull_request: { head: { ref: 'feature-branch', sha: 'abc123' }, number: 7 },
      repository: { owner: { login: 'octocat' }, name: 'hello-world' }
    });
    expect(target.type).toBe('ignored');
  });

  test('a synchronize pull_request (new commits pushed to the PR) is scanned', () => {
    const target = describeScanTarget('pull_request', {
      action: 'synchronize',
      pull_request: { head: { ref: 'feature-branch', sha: 'def456' }, number: 7 },
      repository: { owner: { login: 'octocat' }, name: 'hello-world' }
    });
    expect(target.type).toBe('pull_request');
  });

  test('a push to the default branch is scanned', () => {
    const target = describeScanTarget('push', {
      ref: 'refs/heads/main',
      after: 'sha123',
      repository: { owner: { login: 'octocat' }, name: 'hello-world', default_branch: 'main' }
    });
    expect(target).toEqual({
      type: 'push',
      owner: 'octocat',
      repo: 'hello-world',
      ref: 'main',
      sha: 'sha123'
    });
  });

  test('a push to a non-default branch is ignored', () => {
    const target = describeScanTarget('push', {
      ref: 'refs/heads/some-feature',
      after: 'sha123',
      repository: { owner: { login: 'octocat' }, name: 'hello-world', default_branch: 'main' }
    });
    expect(target.type).toBe('ignored');
  });

  test('a branch-deletion push is ignored', () => {
    const target = describeScanTarget('push', {
      ref: 'refs/heads/main',
      deleted: true,
      repository: { owner: { login: 'octocat' }, name: 'hello-world', default_branch: 'main' }
    });
    expect(target.type).toBe('ignored');
  });

  test('an unsupported event name is ignored', () => {
    expect(describeScanTarget('issues', {}).type).toBe('ignored');
  });
});

describe('relativizeFindings', () => {
  test('rewrites absolute clone-dir paths to clean repo-relative paths', () => {
    const baseDir = '/tmp/guardian-webhook-abc123';
    const findings = [
      { file: path.join(baseDir, 'src', 'app.js'), line: 4 },
      { file: path.join(baseDir, 'bad-server.js'), line: 1 }
    ];
    const relativized = relativizeFindings(findings, baseDir);
    expect(relativized[0].file).toBe(path.join('src', 'app.js'));
    expect(relativized[1].file).toBe('bad-server.js');
  });

  test('does not mutate the original finding objects', () => {
    const baseDir = '/tmp/guardian-webhook-abc123';
    const original = { file: path.join(baseDir, 'app.js'), line: 4 };
    relativizeFindings([original], baseDir);
    expect(original.file).toBe(path.join(baseDir, 'app.js'));
  });
});

describe('postComment', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('posts to the correct issues-comments endpoint with the report as the body', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 1 }) })
    );

    await postComment({
      owner: 'octocat',
      repo: 'hello-world',
      prNumber: 7,
      body: 'report text',
      token: 'tok'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/hello-world/issues/7/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ body: 'report text' })
      })
    );
  });

  test('throws when the GitHub API responds with a non-2xx status', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not Found') })
    );

    await expect(
      postComment({ owner: 'octocat', repo: 'hello-world', prNumber: 7, body: 'x', token: 'tok' })
    ).rejects.toThrow(/404/);
  });
});
