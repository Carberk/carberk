# Reset row self-reference cycle refusal

This checkpoint starts at assembled base `4fed0f01e35aa77877754da8cf3218b52b402ca0`. It covers only the operational reset-row migration and its focused PostgreSQL test. It does not claim Candidate A completion.

The prior real-PostgreSQL probe recorded a mutual `users.suspendedById` pair admitted by `prepare`. `dispose` then failed at `operational_reset_dispose_incomplete:users` after earlier tables had been processed. The transaction rolled back, but the contract requires the refusal during `prepare`, before any disposal effect.

## RED

I added the focused cycle assertion to `packages/db/tests/operational-reset-rows.e2e.spec.ts` without changing the migration and ran:

```text
pnpm exec vitest run tests/operational-reset-rows.e2e.spec.ts
```

The result was 30 tests with 1 failure. The new test reported that `prepare` resolved with `tupleCount: 8` instead of raising `operational_reset_unsupported_cycle`.

## GREEN

The migration now checks every edge in `staging_clean_reset_rows.self_references()` with a bounded recursive walk before it creates `operational_reset_sealed` or inserts an admission. The check covers `users.suspendedById`, `diagnostic_reports.predecessorId`, and `diagnostic_identity_evidence.supersedesId`. The existing avatar cycle check remains in the same pre-effect branch.

The focused PostgreSQL run then passed all 32 tests:

```text
pnpm exec vitest run tests/operational-reset-rows.e2e.spec.ts
# Test Files 1 passed (1)
# tests 32 passed (32)
```

The focused reset Node tests also passed 31/31:

```text
node --test scripts/staging-clean-reset.test.mjs scripts/staging-clean-reset-remote.test.mjs
```

ESLint passed for the changed spec. With an inert local `DATABASE_URL`, Prisma generation, the contracts build, and `pnpm typecheck` passed. No shared staging, provider, storage, production, credentials, or deployment resources were used.

## Source hashes

```text
a46a2ea29d04d0f5ad0d480aa3d2c92ef677388b3f6a808676ab8baa4ab79cdd  packages/db/prisma/migrations/20261029190000_operational_reset_row_admission/migration.sql
7ce54129db0cb8f825150972e5a68577ba041c208c425d3279176db38d45fa23  packages/db/tests/operational-reset-rows.e2e.spec.ts
```

The remaining reset gaps from the prior checkpoint are unchanged. They include the obsolete campaign namespace transition and the broader executor, provider, storage, restoration, and hosted acceptance proofs. This checkpoint closes only the prepare-time self-reference cycle refusal.
