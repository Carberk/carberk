import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 15_000,

    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
