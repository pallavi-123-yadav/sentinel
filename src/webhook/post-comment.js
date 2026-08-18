/**
 * Posts Guardian's report as a comment on a pull request via the GitHub
 * REST API. PRs are just "issues" with extra fields as far as the comments
 * endpoint is concerned, hence `/issues/{number}/comments`.
 */
async function postComment({ owner, repo, prNumber, body, token }) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ body })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API returned ${res.status} while posting comment: ${text}`);
  }

  return res.json();
}

module.exports = { postComment };
