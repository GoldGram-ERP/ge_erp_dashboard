import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "e2e-tests/**",
  ]),
  // The config contract passes backend rows and answers whose shape each page knows; they are typed `any` on purpose.
  { files: ["src/lib/**", "src/components/engine/**", "src/components/fields/**", "src/things/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  // React-compiler style hints, kept as warnings: the pages read refs and set state in effects on purpose (list/lookup sync).
  { rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/refs": "warn" } },
]);

export default eslintConfig;
