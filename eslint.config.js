import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
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
    },
  },
  {
    // Architecture rule #1 (design doc §17): /src/engine is pure TypeScript
    // with ZERO React imports. This is enforced here, not just by convention.
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: '/src/engine must not import React — see §17.' },
            { name: 'react-dom', message: '/src/engine must not import React — see §17.' },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*'],
              message: '/src/engine must not import React — see §17.',
            },
          ],
        },
      ],
    },
  },
)
