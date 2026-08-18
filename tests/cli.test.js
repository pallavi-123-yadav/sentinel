const { buildReportData } = require('../src/scanner/report-data');
const { formatPrettyReport } = require('../src/scanner/pretty-report');

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

describe('buildReportData', () => {
  test('splits findings into confident vs low-confidence using the default threshold', () => {
    const data = buildReportData([finding({ confidence: 0.9 }), finding({ confidence: 0.2 })], []);
    expect(data.confident).toHaveLength(1);
    expect(data.lowConfidence).toHaveLength(1);
  });

  test('a custom minConfidence overrides the default threshold', () => {
    const data = buildReportData([finding({ confidence: 0.4 })], [], { minConfidence: 0.3 });
    expect(data.confident).toHaveLength(1);
    expect(data.lowConfidence).toHaveLength(0);
  });

  test('hasCritical only looks at confident findings', () => {
    const lowConfidenceCritical = buildReportData(
      [finding({ severity: 'CRITICAL', confidence: 0.1 })],
      []
    );
    expect(lowConfidenceCritical.hasCritical).toBe(false);

    const confidentCritical = buildReportData(
      [finding({ severity: 'CRITICAL', confidence: 0.9 })],
      []
    );
    expect(confidentCritical.hasCritical).toBe(true);
  });

  test('sorts confident findings by severity', () => {
    const data = buildReportData(
      [
        finding({ severity: 'LOW', confidence: 1 }),
        finding({ severity: 'CRITICAL', confidence: 1 }),
        finding({ severity: 'MEDIUM', confidence: 1 })
      ],
      []
    );
    expect(data.confident.map((f) => f.severity)).toEqual(['CRITICAL', 'MEDIUM', 'LOW']);
  });
});

describe('formatPrettyReport', () => {
  test('lists confident findings and a total line', () => {
    const report = formatPrettyReport(
      [finding({ severity: 'CRITICAL', confidence: 0.95, label: 'AWS Access Key ID' })],
      [],
      '.'
    );
    expect(report).toContain('AWS Access Key ID');
    expect(report).toContain('Total: 1 issue(s) — 1 CRITICAL');
  });

  test('reports low-confidence findings in a separate section instead of the main list', () => {
    const report = formatPrettyReport([finding({ confidence: 0.2 })], [], '.');
    expect(report).toContain('No issues found.');
    expect(report).toContain('low-confidence finding(s) not shown above');
  });

  test('respects a custom minConfidence passed through reportOptions', () => {
    const report = formatPrettyReport([finding({ confidence: 0.4 })], [], '.', {
      minConfidence: 0.3
    });
    expect(report).toContain('Total: 1 issue(s)');
    expect(report).not.toContain('low-confidence finding(s) not shown above');
  });
});
