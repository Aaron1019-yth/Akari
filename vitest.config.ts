import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./server/__tests__/setup.ts"],
    include: ["server/__tests__/**/*.test.ts"],
  },
});
