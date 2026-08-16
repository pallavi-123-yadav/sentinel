const { formatReport } = require('../src/scanner/ci-report');

function finding(overrides) {
  return {
    type: 'secret',
    id: 'generic-hardcoded-secret',
    label: 'Hardcoded Password/Secret/API Key',
    severity: 'HIGH',
    confidence: 1,
    file: 'src/a.js',
    line: 1,
    snippet: 'const password = "..."',
    ...overrides
  };
}

describe('formatReport confidence bucketing', () => {
  test('confident findings appear in the main summary and list', () => {
    const report = formatReport(
      [finding({ severity: 'CRITICAL', confidence: 0.95, label: 'AWS Access Key ID' })],
      [],
      '.'
    );
    expect(report).toContain('**1 issue(s) found** — 1 CRITICAL');
    expect(report).toContain('AWS Access Key ID');
  });

  test('low-confidence findings are moved into a collapsible section, not the main list', () => {
    const report = formatReport(
      [
        finding({ severity: 'CRITICAL', confidence: 0.95, label: 'AWS Access Key ID' }),
        finding({
          severity: 'HIGH',
          confidence: 0.3,
          label: 'Hardcoded Password',
          file: 'demo/b.js'
        })
      ],
      [],
      '.'
    );
    expect(report).toContain('**1 issue(s) found** — 1 CRITICAL');
    expect(report).toContain('review manually');
    expect(report).toContain('Hardcoded Password');
    expect(report.indexOf('review manually')).toBeLessThan(report.indexOf('Hardcoded Password'));
  });

  test('a scan with only low-confidence findings still reports "no issues found" up top', () => {
    const report = formatReport([finding({ confidence: 0.3 })], [], '.');
    expect(report).toContain('No issues found in `.`');
    expect(report).toContain('review manually');
  });

  test('findings with no confidence field (e.g. hallucinated packages) are treated as fully confident', () => {
    const report = formatReport(
      [finding({ severity: 'CRITICAL', confidence: undefined, label: 'Hallucinated package' })],
      [],
      '.'
    );
    expect(report).toContain('**1 issue(s) found** — 1 CRITICAL');
    expect(report).not.toContain('review manually');
  });
});
