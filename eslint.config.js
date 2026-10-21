import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/', '.wrangler/', 'dist/', 'worker/', 'public/components.css', 'public/focus-visible.js', 'public/dialog.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.serviceworker, HTMLRewriter: 'readonly' }
    }
  },
  {
    files: ['public/app.js', 'public/theme.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, Dialog: 'readonly' }
    }
  },
  {
    files: ['*.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node }
  }
]
