import { configDefaults, defineConfig } from "vitest/config";

// `.mts` so Vite loads this config as ESM in a CommonJS package.
export default defineConfig({
  test: {
    // Vitest 4 stopped excluding dist by default; the build emits compiled code there.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
