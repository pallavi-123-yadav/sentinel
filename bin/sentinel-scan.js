#!/usr/bin/env node
/**
 * The installable Guardian CLI — `npx sentinel-scan [targetDir]`.
 * Wraps the same secret/auth/package checks ci-report.js uses for GitHub
 * Actions, but for a human running it directly in a terminal from any
 * project folder.
 */

const path = require('path');
const { Command } = require('commander');

const packageJson = require('../package.json');
const { runScan } = require('../src/scanner/secret-scanner');
const { checkPackages } = require('../src/scanner/package-checker');
const { formatReport } = require('../src/scanner/ci-report');
const { formatPrettyReport } = require('../src/scanner/pretty-report');
const { buildReportData } = require('../src/scanner/report-data');

const program = new Command();

program
  .name('sentinel-scan')
  .description(
    'Guardian: scans a project for hardcoded secrets, missing auth checks, and hallucinated packages'
  )
  .version(packageJson.version)
  .argument('[targetDir]', 'directory to scan', '.')
  .option('-f, --format <type>', 'output format: pretty, markdown, or json', 'pretty')
  .option('--no-packages', 'skip the hallucinated-package check (avoids network calls)')
  .option(
    '--min-confidence <number>',
    'hide findings below this confidence, 0-1',
    (value) => parseFloat(value),
    0.5
  )
  .action(async (targetDirArg, options) => {
    const targetDir = path.resolve(targetDirArg);
    const reportOptions = { minConfidence: options.minConfidence };

    const secretAndAuthFindings = runScan(targetDir);
    let packageFindings = [];
    let unverified = [];
    if (options.packages) {
      const result = await checkPackages(targetDir);
      packageFindings = result.findings;
      unverified = result.unverified;
    }
    const allFindings = [...secretAndAuthFindings, ...packageFindings];

    if (options.format === 'json') {
      console.log(JSON.stringify(buildReportData(allFindings, unverified, reportOptions), null, 2));
    } else if (options.format === 'markdown') {
      console.log(formatReport(allFindings, unverified, targetDirArg, reportOptions));
    } else {
      console.log(formatPrettyReport(allFindings, unverified, targetDirArg, reportOptions));
    }

    const { hasCritical } = buildReportData(allFindings, unverified, reportOptions);
    process.exitCode = hasCritical ? 1 : 0;
  });

program.parseAsync(process.argv);
