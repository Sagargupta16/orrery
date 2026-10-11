import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The CLI tests start node processes and the render tests boot resvg's wasm; Windows CI
    // runners are several times slower than a laptop.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
