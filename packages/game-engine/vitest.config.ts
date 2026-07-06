import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        // Coverage gate for the rules engine (TEST_STRATEGY.md §3):
        // 100% line / 95% branch on packages/game-engine — non-negotiable.
        lines: 100,
        branches: 95,
        functions: 100,
        statements: 100,
      },
    },
  },
});
