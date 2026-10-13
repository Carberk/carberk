import { availableParallelism } from "node:os";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Spec files run in parallel. test/globalSetup.ts gives each worker its
    // own Postgres database and test/setup-env.ts its own Redis logical
    // database, so a spec's global cleanup reaches only its own worker's rows.
    // At most 8 workers: each runs Nest apps with their own connection pools,
    // and Redis offers 15 logical databases besides the dev server's.
    maxWorkers: Math.min(8, availableParallelism()),
    minWorkers: 1,
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup-env.ts", "reflect-metadata"],
  },
});
