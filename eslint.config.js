const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // The dashboard is a separate Next.js subproject with its own
    // package.json, ESLint config (eslint-config-next), and build output —
    // it lints and formats itself, not through the root config.
    ignores: ['node_modules/', 'coverage/', 'dashboard/']
  }
];
