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
    // Local artefacts: database, caches, Vercel's build output, and the
    // tooling this machine keeps outside the app source.
    ".data/**",
    ".vercel/**",
    ".pnpm-store/**",
    ".npm-cache/**",
    ".tools/**",
  ]),
]);

export default eslintConfig;
