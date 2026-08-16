const path = require('path');
const {
  checkPackages,
  parseNpmManifest,
  parsePipManifest,
  parsePipRequirementLine
} = require('../src/scanner/package-checker');

describe('parseNpmManifest', () => {
  test('reads dependencies and devDependencies from sample-app/package.json', () => {
    const packages = parseNpmManifest(path.join(__dirname, '..', 'sample-app', 'package.json'));
    const names = packages.map((p) => p.name);
    expect(names).toContain('express');
    expect(names).toContain('super-duper-fetch-utils-pro');
  });
});

describe('parsePipRequirementLine', () => {
  test('extracts a bare name from a pinned requirement', () => {
    expect(parsePipRequirementLine('flask==3.0.3')).toBe('flask');
  });

  test('extracts a bare name with a version range and trailing comment', () => {
    expect(parsePipRequirementLine('requests>=2.0  # http client')).toBe('requests');
  });

  test('ignores blank lines', () => {
    expect(parsePipRequirementLine('   ')).toBeNull();
  });

  test('ignores comment-only lines', () => {
    expect(parsePipRequirementLine('# just a comment')).toBeNull();
  });

  test('ignores editable/flag lines', () => {
    expect(parsePipRequirementLine('-e git+https://github.com/foo/bar.git')).toBeNull();
    expect(parsePipRequirementLine('-r other-requirements.txt')).toBeNull();
  });
});

describe('parsePipManifest', () => {
  test('reads package names from sample-app/requirements.txt', () => {
    const packages = parsePipManifest(path.join(__dirname, '..', 'sample-app', 'requirements.txt'));
    const names = packages.map((p) => p.name);
    expect(names).toEqual(['flask', 'requests', 'turbo-json-normalizer-ai']);
  });
});

describe('checkPackages (network mocked)', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('flags packages the registry returns 404 for, leaves real ones alone', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('super-duper-fetch-utils-pro')) {
        return Promise.resolve({ status: 404 });
      }
      if (url.includes('turbo-json-normalizer-ai')) {
        return Promise.resolve({ status: 404 });
      }
      return Promise.resolve({ status: 200 });
    });

    const report = await checkPackages(path.join(__dirname, '..', 'sample-app'));

    expect(report.findings).toHaveLength(2);
    const flaggedNames = report.findings.map((f) => f.snippet);
    expect(flaggedNames.some((s) => s.includes('super-duper-fetch-utils-pro'))).toBe(true);
    expect(flaggedNames.some((s) => s.includes('turbo-json-normalizer-ai'))).toBe(true);
    expect(report.unverified).toHaveLength(0);
  });

  test('treats network failures as unverified, not as findings', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));

    const report = await checkPackages(path.join(__dirname, '..', 'sample-app'));

    expect(report.findings).toHaveLength(0);
    expect(report.unverified.length).toBeGreaterThan(0);
  });
});
