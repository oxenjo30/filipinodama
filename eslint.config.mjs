// Flat ESLint config (ESLint 9) for the whole monorepo.
// Each package's `lint` script runs `eslint src`; ESLint 9 walks up from the
// target directory and discovers this root config, so one config covers all
// four packages (game-engine, shared, server, web).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Never lint build output, deps, or the copied prototype/handoff sources.
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "handoff/**",
      "**/prisma/migrations/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared language options for all TS/JS source.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Allow intentionally-unused args/vars when prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // The codebase uses controlled `any` in a few DTO/serialization spots.
      "@typescript-eslint/no-explicit-any": "off",
      // Empty catch blocks are used deliberately (e.g. best-effort token parse).
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },

  // React hooks rules for the web app only.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
);
