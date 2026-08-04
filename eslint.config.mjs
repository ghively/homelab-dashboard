import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A leading underscore marks something intentionally unused — a
      // destructured field kept for shape, a parameter required by a signature,
      // a caught error that is deliberately swallowed. Without this the
      // convention is meaningless and the warning is unsilenceable except by
      // deleting code that has to stay.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Software-factory tooling, not application code: adws/ is sssf's own
    // ADW scripts/extensions and .claude/skills/ is vendored skill content.
    "adws/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
