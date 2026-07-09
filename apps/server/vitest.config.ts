import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // integration tests hit a real DB + run their own transactions — no parallelism across files
    fileParallelism: false,
    hookTimeout: 20000,
    testTimeout: 20000,
    setupFiles: ["./test/setup-env.ts"],
  },
});
