const fs = require('fs');
const os = require('os');
const path = require('path');
const { runScan, scanFileForSecrets } = require('../src/scanner/secret-scanner');

describe('Guardian does not flag its own fixtures', () => {
  test('scanning the whole repo produces no findings from sample-app/ or tests/', () => {
    const repoRoot = path.join(__dirname, '..');
    const findings = runScan(repoRoot);
    const fromFixtures = findings.filter(
      (f) =>
        f.file.includes(`${path.sep}sample-app${path.sep}`) ||
        f.file.includes(`${path.sep}tests${path.sep}`)
    );
    expect(fromFixtures).toHaveLength(0);
  });
});

describe('ignore-list', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-ignore-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('skips files inside a nested test/ directory but still catches the same secret elsewhere', () => {
    fs.mkdirSync(path.join(tmpDir, 'test'));
    fs.writeFileSync(path.join(tmpDir, 'test', 'leaky.js'), `const key = "AKIAIOSFODNN7EXAMPLE";`);
    fs.writeFileSync(path.join(tmpDir, 'real.js'), `const key = "AKIAIOSFODNN7EXAMPLE";`);

    const findings = runScan(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toContain('real.js');
  });

  test('skips a sample-app/ directory the same way', () => {
    fs.mkdirSync(path.join(tmpDir, 'sample-app'));
    fs.writeFileSync(
      path.join(tmpDir, 'sample-app', 'leaky.js'),
      `const key = "AKIAIOSFODNN7EXAMPLE";`
    );

    expect(runScan(tmpDir)).toHaveLength(0);
  });

  test('skips files with a .test./.spec./.example. marker even outside an ignored directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.test.js'), `const key = "AKIAIOSFODNN7EXAMPLE";`);
    fs.writeFileSync(path.join(tmpDir, 'config.js'), `const key = "AKIAIOSFODNN7EXAMPLE";`);

    const findings = runScan(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toContain('config.js');
  });
});

describe('confidence scoring', () => {
  test('a well-anchored pattern (AWS key) gets higher confidence than the generic catch-all', () => {
    const awsFindings = scanFileForSecrets('src/config.js', `const key = "AKIAIOSFODNN7EXAMPLE";`);
    const genericFindings = scanFileForSecrets(
      'src/config.js',
      `const password = "hunter2isnotarealpassword";`
    );
    expect(awsFindings[0].confidence).toBeGreaterThan(genericFindings[0].confidence);
  });

  test('the same match gets a dampened confidence under a demo/sandbox-ish path', () => {
    const normal = scanFileForSecrets('src/config.js', `const key = "AKIAIOSFODNN7EXAMPLE";`);
    const demo = scanFileForSecrets('demo/config.js', `const key = "AKIAIOSFODNN7EXAMPLE";`);
    expect(demo[0].confidence).toBeLessThan(normal[0].confidence);
  });
});
