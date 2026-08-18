#!/usr/bin/env node
/**
 * Guardian's standalone webhook server — the actual "watchdog sitting on
 * top of your repo" piece. GitHub pings this on every push/PR, it clones
 * the code, scans it, and posts the result as a PR comment, with no CI
 * config required in the target repo.
 *
 * Setup:
 *   1. Copy .env.example to .env and fill in GITHUB_WEBHOOK_SECRET (any
 *      random string — you choose it) and GITHUB_TOKEN (a PAT with repo
 *      scope, or a GitHub App installation token).
 *   2. Run this server (`npm run webhook`) somewhere GitHub can reach —
 *      locally via a tunnel (e.g. `ngrok http 4000`) for testing, or a real
 *      host (Render/Railway/Fly) for a live demo.
 *   3. In the target GitHub repo: Settings > Webhooks > Add webhook.
 *      Payload URL = https://<your-host>/webhook, content type =
 *      application/json, secret = same value as GITHUB_WEBHOOK_SECRET,
 *      events = "Pushes" and "Pull requests".
 *
 * Usage: node src/webhook/server.js
 */

require('dotenv').config();
const express = require('express');

const { verifySignature } = require('./verify-signature');
const { describeScanTarget } = require('./parse-event');
const { cloneAndScan } = require('./clone-and-scan');
const { postComment } = require('./post-comment');

const PORT = process.env.PORT || 4000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function createApp() {
  const app = express();

  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  app.post('/webhook', (req, res) => {
    if (!WEBHOOK_SECRET) {
      console.error('GITHUB_WEBHOOK_SECRET is not set — refusing all webhook deliveries.');
      return res.status(500).send('server misconfigured: no webhook secret set');
    }

    const signature = req.get('X-Hub-Signature-256');
    if (!verifySignature(req.rawBody, signature, WEBHOOK_SECRET)) {
      return res.status(401).send('invalid signature');
    }

    const eventName = req.get('X-GitHub-Event');
    const target = describeScanTarget(eventName, req.body);

    if (target.type === 'ping') {
      return res.status(200).send('pong');
    }
    if (target.type === 'ignored') {
      return res.status(202).send(`ignored: ${target.reason}`);
    }

    // GitHub expects a fast response and will retry/flag deliveries that
    // don't reply in time — acknowledge immediately, clone+scan afterward.
    res.status(202).send('accepted');

    handleScan(target).catch((err) => {
      console.error(`Guardian webhook handling failed for ${target.owner}/${target.repo}:`, err);
    });
  });

  return app;
}

async function handleScan(target) {
  const { report, hasCritical, findingCount } = await cloneAndScan({
    owner: target.owner,
    repo: target.repo,
    ref: target.ref,
    token: GITHUB_TOKEN
  });

  console.log(
    `Guardian scan for ${target.owner}/${target.repo}@${target.ref}: ` +
      `${findingCount} finding(s)${hasCritical ? ' (CRITICAL present)' : ''}`
  );

  if (target.type === 'pull_request') {
    if (!GITHUB_TOKEN) {
      console.error('GITHUB_TOKEN is not set — scan ran, but the PR comment could not be posted.');
      return;
    }
    await postComment({
      owner: target.owner,
      repo: target.repo,
      prNumber: target.prNumber,
      body: report,
      token: GITHUB_TOKEN
    });
  }
}

if (require.main === module) {
  if (!WEBHOOK_SECRET) {
    console.warn(
      'Warning: GITHUB_WEBHOOK_SECRET is not set — every webhook delivery will be rejected.'
    );
  }
  createApp().listen(PORT, () => {
    console.log(`Guardian webhook server listening on port ${PORT}`);
  });
}

module.exports = { createApp };
