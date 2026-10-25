import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import routeElementPlugin from './eslint-rules/route-element-jsx.js'

const TEST_FILES = ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}', 'src/integration/**/*.{ts,tsx}']

const layer = (name) => [`@/${name}`, `@/${name}/*`, `**/${name}/*`]

// Dependencies point inwards: pages/app/router -> components -> application -> domain.
// Infrastructure implements domain contracts and is created only by gateway providers.
function boundary(files, forbidden, message, ignores = []) {
  return {
    files,
    ignores: [...TEST_FILES, ...ignores],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: forbidden.flatMap(layer), message }],
      }],
    },
  }
}

export default [
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        fixStyle: 'inline-type-imports',
      }],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-undef': 'error',
      complexity: ['error', 20],
      'max-lines-per-function': ['error', {
        max: 200,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
  },
  {
    files: TEST_FILES,
    rules: {
      // describe/it callbacks group many scenarios; size is not a design smell there.
      'max-lines-per-function': 'off',
      complexity: 'off',
      // Vitest writes inline snapshots with escaped quotes.
      'no-useless-escape': 'off',
    },
  },
  boundary(
    ['src/domain/**/*.{ts,tsx}'],
    ['application', 'infrastructure', 'components', 'pages', 'app', 'router', 'shared'],
    'Domain code is framework-free and depends only on other domain modules.',
  ),
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query']
          .map((name) => ({ name, message: 'Domain code is framework-free.' })),
        patterns: [{
          group: ['application', 'infrastructure', 'components', 'pages', 'app', 'router', 'shared'].flatMap(layer),
          message: 'Domain code is framework-free and depends only on other domain modules.',
        }],
      }],
    },
  },
  boundary(
    ['src/infrastructure/**/*.{ts,tsx}'],
    ['application', 'components', 'pages', 'app', 'router'],
    'Infrastructure adapters implement domain contracts and must not depend on the UI or application layers.',
  ),
  boundary(
    ['src/application/**/*.{ts,tsx}'],
    ['components', 'pages', 'app', 'router', 'infrastructure'],
    'Application code must not depend on UI layers; only gateway providers may construct infrastructure adapters.',
    ['src/application/vault/*GatewayProvider.tsx', 'src/application/vault/VaultSessionProvider.tsx'],
  ),
  boundary(
    ['src/application/vault/*GatewayProvider.tsx', 'src/application/vault/VaultSessionProvider.tsx'],
    ['components', 'pages', 'app', 'router'],
    'Application code must not depend on UI layers.',
  ),
  boundary(
    ['src/components/**/*.{ts,tsx}'],
    ['pages', 'app', 'router', 'infrastructure'],
    'Shared components must not depend on pages, routing, or infrastructure.',
  ),
  boundary(
    ['src/pages/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/router/**/*.{ts,tsx}'],
    ['infrastructure'],
    'UI code reaches Vault only through application hooks and gateways.',
  ),
  // Only enforce this rule for the router config file to avoid false positives elsewhere.
  {
    files: ['src/router/config.tsx'],
    plugins: {
      'local-route': routeElementPlugin,
    },
    rules: {
      'local-route/route-element-jsx': 'error',
    },
  },
]
