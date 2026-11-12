// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Contexts export their hook next to the provider, and some component
      // files share small helpers; that only affects hot reload in dev.
      'react-refresh/only-export-components': 'off',
      // API payloads are typed at the edges (src/types); same policy as the API
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Node-side scripts and tests (node:test, Vite config)
    files: ['test/**/*.{js,mjs}', '*.config.{js,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // Puppeteer smoke: callbacks passed to page.evaluate run in the browser
    files: ['test/browser-smoke.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
