// eslint-disable-next-line import/no-unresolved
import { configDefaults, defineConfig } from "vitest/config";

// `.mts` so Vite loads this config as ESM in a CommonJS package.
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Vitest 4 stopped excluding dist by default; the build emits compiled code there.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
