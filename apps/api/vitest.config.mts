import { availableParallelism } from "node:os";

import { configDefaults, defineConfig } from "vitest/config";

// `.mts` so Vite loads this config as ESM in a CommonJS package.
export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Vitest 4 stopped excluding dist by default; `nest build` emits compiled specs there.
    exclude: [...configDefaults.exclude, "**/dist/**"],
    // Spec files run in parallel. test/globalSetup.ts gives each worker its
    // own Postgres database and test/setup-env.ts its own Redis logical
    // database, so a spec's global cleanup reaches only its own worker's rows.
    // At most 8 workers: each runs Nest apps with their own connection pools,
    // and Redis offers 15 logical databases besides the dev server's.
    maxWorkers: Math.min(8, availableParallelism()),
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup-env.ts", "reflect-metadata"],
  },
});
