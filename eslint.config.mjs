import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow the conventional `_name` prefix for intentionally unused destructured values.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/sw.js", "eslint-report.json", "playwright-report/**", "test-results/**"]),
])

export default eslintConfig
