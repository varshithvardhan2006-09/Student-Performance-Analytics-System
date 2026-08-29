// ============================================================================
// ESLint flat config for SAPS
// Run with:  cd backend && npm run lint
// (the script steps up to the project root first, so this config's base path
//  covers backend/ and frontend/ in one pass)
// The backend is CommonJS; the frontend is browser ES modules. They need
// different globals and different source types, hence the two blocks.
// ============================================================================

export default [
  {
    ignores: ['**/node_modules/**', 'public/**', 'docs/**'],
  },

  // ------------------------------------------------------------ backend (CJS)
  {
    files: ['**/backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', exports: 'writable',
        process: 'readonly', console: 'readonly', Buffer: 'readonly',
        __dirname: 'readonly', __filename: 'readonly', global: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        setImmediate: 'readonly', queueMicrotask: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        TextDecoder: 'readonly', TextEncoder: 'readonly', structuredClone: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^(next|_)',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'warn',
      'no-unsafe-negation': 'error',
      'no-async-promise-executor': 'error',
      'no-fallthrough': 'error',
      'no-cond-assign': 'error',
      'no-irregular-whitespace': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'eqeqeq': ['warn', 'smart'],
    },
  },

  // -------------------------------------------------- backend tests (node:test)
  {
    files: ['**/backend/tests/**/*.js'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly' },
    },
  },

  // -------------------------------------------------- frontend (browser ESM)
  {
    files: ['**/frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly',
        fetch: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
        FormData: 'readonly', Blob: 'readonly', File: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Intl: 'readonly',
        Chart: 'readonly', navigator: 'readonly', alert: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        getComputedStyle: 'readonly', AbortController: 'readonly',
        CustomEvent: 'readonly', Event: 'readonly', HTMLElement: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'warn',
      'no-unsafe-negation': 'error',
      'no-fallthrough': 'error',
      'no-cond-assign': 'error',
      'no-irregular-whitespace': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'eqeqeq': ['warn', 'smart'],
    },
  },
];
