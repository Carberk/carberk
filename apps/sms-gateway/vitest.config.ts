import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 15_000,
    // Vitest 4 stopped excluding dist by default; the build writes dist here.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
