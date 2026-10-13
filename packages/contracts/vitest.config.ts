import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Vitest 4 stopped excluding dist by default; the build emits compiled specs there.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
