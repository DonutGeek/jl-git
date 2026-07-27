// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    name: "jlgit/global-ignores",
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "src/components/ui/**",
      "coverage/**",
      ".pnpm-store/**",
      ".secrets/**",
    ],
  },
  {
    name: "jlgit/typescript-react",
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
    },
  },
  {
    name: "jlgit/config-files",
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  eslintConfigPrettier,
]);
