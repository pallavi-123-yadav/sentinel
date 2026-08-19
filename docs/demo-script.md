# Demo video script (60–90s)

A shot-by-shot storyboard for the recording called for in the roadmap — exact
commands to run, in order, with rough timing. Practice it once before
recording; every command here is real and already verified to work.

**Setup before you hit record:**
- Terminal font size large enough to read on a recording (14–16pt+).
- Two terminal tabs ready: one in the repo root, one with `cd dashboard`
  already run.
- Dashboard dev server already running in the background (`npm run dev` in
  `dashboard/`) so you're not waiting on it live.
- `sample-app/bad-server.js` open in an editor tab, ready to flash on screen.

---

**0:00–0:10 — Cold open on the problem**

Say: *"AI coding tools ship fast, but they don't think like a security
engineer."*

Show `sample-app/bad-server.js` in the editor for a few seconds — enough for
the viewer to read `AWS_ACCESS_KEY_ID`, `STRIPE_SECRET_KEY`, and the
unprotected `app.delete('/api/admin/users/:id', ...)` route.

**0:10–0:35 — Catch it live, in the terminal**

Switch to the terminal, run:

```bash
node bin/sentinel-scan.js sample-app --no-packages
```

Let it scroll. Pause/zoom on the `[CRITICAL] AWS Access Key ID` line and the
`[HIGH] Route DELETE /api/admin/users/:id has no visible auth check` line —
these are the two most visually convincing catches (a real-shaped credential,
and a missing-login-check called out in plain English).

Say: *"Guardian caught a hardcoded AWS key and an admin route with no login
check — in one command, no config."*

**0:35–0:55 — Show it's not just a script**

Switch to the dashboard tab (already running at `localhost:3000`). Type
`sample-app` into the folder field, hit **Run scan**. Let the table render —
pause on the severity badges and confidence percentages.

Say: *"Same scanner, as a dashboard — or wired into GitHub so it comments on
every pull request automatically."*

**0:55–1:10 — Prove it's not just the demo fixture**

Cut to a screenshot or quick scroll of `EVALUATION.md` — specifically the
headline numbers section (1 false alarm across 9 real production libraries,
3/3 known-vulnerable repos caught).

Say: *"Tested against real open-source repos, not just this demo app — one
false alarm across nine clean libraries, and it caught every planted
vulnerability in three intentionally-vulnerable test apps."*

**1:10–1:20 — Close**

Cut to the GitHub repo page / README.

Say: *"Guardian — open source, plain-English output, CLI, CI, webhook, or
dashboard. Link in the description."*

---

## Recording notes

- Total: ~80 seconds if you don't rush the pauses. Trim the 0:55–1:10 beat
  first if you need to hit 60s — the terminal catch (0:10–0:35) and the
  dashboard (0:35–0:55) are the two beats that actually sell the tool.
- Use `--no-packages` on the CLI run shown on camera — it skips the
  network-bound hallucinated-package check, so the demo doesn't stall
  waiting on npm/PyPI registry calls on camera.
- If recording the dashboard, make sure `npm run dev` has been running for
  at least a few seconds before you hit record — the first Turbopack compile
  has a visible delay you don't want live on camera.
