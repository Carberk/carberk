import path from "node:path";

import { defineConfig } from "vitest/config";

// `.mts` so Vite loads this config as ESM in a CommonJS package.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
  },
});
