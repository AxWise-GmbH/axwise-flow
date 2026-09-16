import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import yaml from 'js-yaml'

// ─────────────────────────────────────────────────────────────
// Module boundary rules — loaded from MODULES.yaml at the root.
// Wrapped in try/catch: a missing or malformed MODULES.yaml
// skips the rules silently and never breaks the build.
//
// Expected MODULES.yaml shape:
//   forbidden_imports:
//     - group: ["../api/**", "../../api/**"]
//       message: "Use the service layer — do not import api/ directly"
//     - group: ["*/lib/supabase"]
//       message: "Access Supabase via service modules, not lib/supabase"
// ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))

let moduleBoundaryConfigs = []
try {
  const raw = readFileSync(resolve(__dirname, 'MODULES.yaml'), 'utf8')
  const parsed = yaml.load(raw)
  const forbidden = parsed?.forbidden_imports
  if (Array.isArray(forbidden) && forbidden.length > 0) {
    const patterns = forbidden.map(({ group, message }) => ({
      group: Array.isArray(group) ? group : [group],
      message: message ?? 'Module boundary violation — see MODULES.yaml',
    }))
    moduleBoundaryConfigs = [
      {
        files: ['**/*.{js,jsx}'],
        rules: {
          'no-restricted-imports': ['warn', { patterns }],
        },
      },
    ]
  }
} catch {
  // MODULES.yaml missing or invalid — module boundary rules skipped
}

export default defineConfig([
  globalIgnores(['dist', '.vercel']),
  {
    files: ['api/**/*.js', 'lib/**/*.js', 'server/**/*.js', 'scripts/**/*.js', '**/*.test.js', '*.config.js', 'vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^(_|[A-Z_])', argsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'react-refresh/only-export-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  // Module boundary configs — generated from MODULES.yaml forbidden_imports.
  // Empty array when MODULES.yaml is absent (spread is a no-op).
  ...moduleBoundaryConfigs,
])
