const path = require('path');
const {
  runScan,
  scanFileForSecrets,
  scanFileForMissingAuth
} = require('../src/scanner/secret-scanner');

describe('runScan against the planted-vulnerability sample app', () => {
  const findings = runScan(path.join(__dirname, '..', 'sample-app'));

  test('catches the AWS access key', () => {
    expect(findings.some((f) => f.id === 'aws-access-key-id')).toBe(true);
  });

  test('catches the Stripe live secret key', () => {
    expect(findings.some((f) => f.id === 'stripe-live-key')).toBe(true);
  });

  test('catches the GitHub token', () => {
    expect(findings.some((f) => f.id === 'github-token')).toBe(true);
  });

  test('catches the Slack webhook', () => {
    expect(findings.some((f) => f.id === 'slack-webhook')).toBe(true);
  });

  test('flags the unauthenticated GET /api/users/:id route', () => {
    expect(
      findings.some((f) => f.type === 'missing-auth' && f.snippet.includes("'/api/users/:id'"))
    ).toBe(true);
  });

  test('flags the unauthenticated DELETE /api/admin/users/:id route', () => {
    expect(
      findings.some(
        (f) => f.type === 'missing-auth' && f.snippet.includes("'/api/admin/users/:id'")
      )
    ).toBe(true);
  });

  test('does not flag the /health route', () => {
    expect(findings.some((f) => f.snippet && f.snippet.includes("'/health'"))).toBe(false);
  });

  test('does not flag the /api/account route, which checks authorization', () => {
    expect(findings.some((f) => f.snippet && f.snippet.includes("'/api/account'"))).toBe(false);
  });
});

describe('scanFileForSecrets', () => {
  test('ignores obvious placeholder values', () => {
    const content = `const apiKey = "changeme";\nconst password = "your_password_here";`;
    const findings = scanFileForSecrets('fake.js', content);
    expect(findings.length).toBe(0);
  });

  test('ignores values pulled from process.env', () => {
    const content = `const secret = process.env.DB_PASSWORD;`;
    const findings = scanFileForSecrets('fake.js', content);
    expect(findings.length).toBe(0);
  });

  test('flags a hardcoded password literal', () => {
    const content = `const password = "hunter2isnotarealpassword";`;
    const findings = scanFileForSecrets('fake.js', content);
    expect(findings.some((f) => f.id === 'generic-hardcoded-secret')).toBe(true);
  });
});

describe('scanFileForMissingAuth', () => {
  test('does not flag a GET route that checks req.headers.authorization', () => {
    const content = `
      app.get('/api/account', (req, res) => {
        if (!req.headers.authorization) return res.status(401).json({});
        res.json({ ok: true });
      });
    `;
    const findings = scanFileForMissingAuth('fake.js', content);
    expect(findings.length).toBe(0);
  });

  test('flags a DELETE route with no auth check', () => {
    const content = `
      app.delete('/api/admin/users/:id', (req, res) => {
        res.json({ deleted: req.params.id });
      });
    `;
    const findings = scanFileForMissingAuth('fake.js', content);
    expect(findings.length).toBe(1);
  });

  test('does not flag routes covered by app.use(customMiddleware) registered earlier', () => {
    const content = `
      function requireAuth(req, res, next) {
        if (!req.headers.authorization) return res.status(401).end();
        next();
      }
      app.use(requireAuth);
      app.get('/api/users/:id', (req, res) => {
        res.json({ id: req.params.id });
      });
      app.delete('/api/admin/users/:id', (req, res) => {
        res.json({ deleted: req.params.id });
      });
    `;
    expect(scanFileForMissingAuth('fake.js', content).length).toBe(0);
  });

  test('does not flag router.* routes covered by router.use(customMiddleware)', () => {
    const content = `
      const router = require('express').Router();
      router.use(requireAuth);
      router.get('/api/users/:id', (req, res) => {
        res.json({ id: req.params.id });
      });
    `;
    expect(scanFileForMissingAuth('fake.js', content).length).toBe(0);
  });

  test('does not flag a route with inline middleware between path and handler', () => {
    const content = `
      app.get('/api/users/:id', requireAuth, (req, res) => {
        res.json({ id: req.params.id });
      });
    `;
    expect(scanFileForMissingAuth('fake.js', content).length).toBe(0);
  });

  test('catches an unprotected router.* route (router-based apps are the common case)', () => {
    const content = `
      const router = require('express').Router();
      router.delete('/api/admin/users/:id', (req, res) => {
        res.json({ deleted: req.params.id });
      });
    `;
    expect(scanFileForMissingAuth('fake.js', content).length).toBe(1);
  });

  test('app.use(express.json()) and other framework middleware do not count as auth coverage', () => {
    const content = `
      app.use(express.json());
      app.use(cors());
      app.delete('/api/admin/users/:id', (req, res) => {
        res.json({ deleted: req.params.id });
      });
    `;
    expect(scanFileForMissingAuth('fake.js', content).length).toBe(1);
  });
});
