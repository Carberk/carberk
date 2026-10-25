import { availableParallelism } from "node:os";

import { configDefaults, defineConfig } from "vitest/config";

import { b5ObservationPlugin } from "./test/b5-observation-plugin.mjs";

// `.mts` so Vite loads this config as ESM in a CommonJS package.
export default defineConfig({
  plugins: [b5ObservationPlugin()],
  test: {
    maxWorkers: Math.min(4, availableParallelism()),
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // Vitest 4 stopped excluding dist by default; the build emits compiled code there.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
