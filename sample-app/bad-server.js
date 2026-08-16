const express = require('express');
const app = express();

app.use(express.json());

// Hardcoded credentials — should be flagged as secrets
const AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const STRIPE_SECRET_KEY = 'sk_live_FAKEFAKEFAKEFAKEFAKEFAKE';
const DB_PASSWORD = 'SuperSecretPassword123!';
const JWT_SECRET = 'my-super-secret-jwt-signing-key';
const GITHUB_TOKEN = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz12';
const SLACK_WEBHOOK =
  "https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/XXXXXXXXXXXXXXXXXXXXXXXX";
const db = {
  connectionString: `postgres://admin:${DB_PASSWORD}@localhost:5432/prod`
};

// Public route — fine, no auth needed
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Sensitive route with NO auth check — should be flagged as missing-auth
app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id, email: 'user@example.com', ssn: '123-45-6789' });
});

// Admin route with NO auth check — should be flagged as missing-auth
app.delete('/api/admin/users/:id', (req, res) => {
  res.json({ deleted: req.params.id });
});

// Route that DOES check auth — should NOT be flagged
app.get('/api/account', (req, res) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ account: 'ok' });
});

app.listen(3000, () => {
  console.log('Bad server running on port 3000');
});

module.exports = app;
