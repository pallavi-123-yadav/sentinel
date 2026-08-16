/**
 * Shared "this isn't real application code" heuristics, used by both the
 * secret/auth scanner and the package checker so a directory only has to be
 * taught to Guardian once.
 */

// Directories that are either build output or exist specifically to hold
// test/fixture/example code, not real production code.
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'test',
  'tests',
  '__tests__',
  '__mocks__',
  'mock',
  'mocks',
  'fixture',
  'fixtures',
  'sample-app',
  'sample',
  'samples',
  'example',
  'examples',
  'spec',
  'specs'
]);

// Files named like `foo.test.js`, `config.sample.json`, `api.mock.ts` —
// test/example code that lives next to real source instead of in its own
// ignored directory.
const IGNORED_FILENAME_PATTERN = /\.(test|spec|example|sample|fixture|mock)\.[^./]+$/i;

// Softer signal than IGNORED_DIRS: doesn't disqualify a file from being
// scanned, but a match found under one of these is dampened rather than
// dropped, since these directory names are used for both throwaway and real
// code often enough that hard-excluding them risks hiding a real secret.
const LOW_SIGNAL_PATH_HINT = /(^|[\\/])(demo|demos|playground|sandbox|scratch|tmp|temp)([\\/]|$)/i;

module.exports = { IGNORED_DIRS, IGNORED_FILENAME_PATTERN, LOW_SIGNAL_PATH_HINT };
