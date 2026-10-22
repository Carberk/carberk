# Issue 914 private consumption atomicity test slice

Bounded test-writer checkpoint for #914 within founder-selected #897, sole integration PR #904. Base `f31f4e828ad6ff8d80ed35253e791ca005e57dff`, tree `7681abf68c85893591476880242dcfda70fa69ac`. Reserved and pushed `agent/issue-914-consumption-atomicity-20261022-3f7bf0ac` at that base before edits. Host scaffold `t3/3f7bf0ac` remains unchanged at the base.

The prior `/tmp/carberk-resume-20261021/private-consumption-next-acceptance-20261022.md` outline's preservation baseline is now **91**, replacing its stale 75. Its authority steps 1–3 belong to the already-appended authority slice; this checkpoint adds only steps 4–5. Earlier documented coverage/runtime limitations, including exact rights-expiry coverage, remain unchanged. Parent reports original 75 hosted cases passed at `0169758a`; the extra 16 authority cases at this base were still running at handoff. This writer does not classify their hosted outcome.

## Added acceptance coverage

Two appended `it.each` declarations expand to five cases, using unchanged ordinary retained manual/manual pair, issuance and reinspection HTTP helpers with real Prisma/PostgreSQL:

- Identical proof/report requests under observed contention return two 201 responses with identical results and an exact authorized retry.
- Distinct report ids on one proof return one 201 and one 409 `DIAGNOSTIC_REINSPECTION_CONFLICT`.
- Two unused proofs for one A/B return one 201 and one generic 403. Only one successor/proof consumption commits; the other proof is invalidated by the existing report INSERT trigger and remains unconsumed.
- Exact `REPORT_REINSPECTION_CREATED` audit INSERT failure rolls back the new report, consumed marker, identity pins and audits.
- Exact `CONTINUITY_PROOF_CONSUMED` audit INSERT failure rolls back those writes, including the earlier creation audit.

The contention helper reuses the existing DiagnosticReports suite's bounded row-lock pattern: hold sorted A/B order rows, dispatch requests, observe both blocked backends through `pg_blocking_pids` before releasing, then drain requests. Same 500-observation bound, default transaction budget and no added delay, timeout or retry. Assertions check the winner through HTTP and hidden state through database reads, including exactly one creation audit and one consumption audit and no changes after exact retry.

Each audit fault uses the existing issuance-fault pattern. Before DDL it requires injected disposable-worker metadata, a valid worker index and exact `current_database()` equality. Atomic installation scopes the trigger to generated candidate/center/actor/report UUIDs and one literal action. Its sequence receipt requires the real consumed proof and report already visible inside the failing INSERT transaction. Sequence `last_value=1, is_called=true` survives rollback. Exact sanitized 500 output and complete before/after persistence equality are required. A `finally` transaction removes trigger/function/sequence/schema; the same ordinary request must succeed after removal. No proof, report or identity-pin rows are seeded.

## Preservation

Removing only the new block, from the newline before `// Private consumption atomicity slice.` to the original final suite-closing newline, reconstructs all **75,366 original bytes**, SHA-256 `2ce6f262ebe23c6c63fe3ecf32bd606fad297aacdd8a83ea2ea3b19c2444c6fa`. This includes every original helper, setup, teardown and all 91 cases. TypeScript AST extraction also confirms all 31 original outer test-call expressions retain identical text/order; JSON-array SHA-256 `097679ca8ebe4ed94eb0c797da985e2d520474871069dd5c8005bb6450202803`.

Expanded Vitest collection independently collected the base from a temporary adjacent byte-identical spec and this candidate with no setup/global setup/hooks. All original 91 names/order match the first 91 of 96 candidate cases. SHA-256 of their compact UTF-8 JSON name array: `ae8129040f1d88739a5335dcc21dbdf7d36084e1c36468a53b3c0e8f69e48f3a`. The temporary baseline spec was removed.

All 193 tracked paths matching `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` are byte-identical to base. SHA-256 of their sorted `path SHA256\n` manifest: `ba5f060d938aed5df5163b4d12e10948e088ab88ed364752c076d88647d5e410`. Full diff contains only the appended spec block and this evidence note. CampaignFullV3/reset callers and bodies, production, schema, contracts, CI and guard configuration remain untouched.

## Offline verification

- `pnpm --filter @auto-tm/contracts build`, then `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: PASS. Dummy offline URL permits generation only; no database connection.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue914-vitest-collection.mts --staticParse=false --json`: PASS, 96 expanded cases. `/tmp/issue914-vitest-baseline.mts` variant: PASS, 91. Each temporary config exports only `{ test: { globals: true, setupFiles: [], globalSetup: [], include: [absoluteSpecPath] } }`.
- `pnpm --filter @auto-tm/api typecheck`, `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, `pnpm --filter @auto-tm/api lint`: PASS.
- `pnpm --filter @auto-tm/api build`: PASS.
- `pnpm typecheck`: PASS, 11 tasks, 10 cached.
- `pnpm test:unit`: PASS, 10 tasks, 9 cached. API freshly ran 261 files, 2425 passed tests, 2 existing skipped tests.
- `pnpm check:runtime-imports`: PASS for db/contracts.
- `pnpm test:agent-docs`: PASS, 8 tests. `pnpm check:glossary`: PASS, 31 terms. `pnpm test:glossary`: PASS, 40 tests.
- `git diff --check`: PASS. Whole-file reconstruction, original expanded collection/name comparison and protected-path hash comparison: PASS.

Preparation failures: first standalone DB build lacked `DATABASE_URL`; second used the dummy URL but lacked built contracts. Building contracts before DB resolved both. A temporary AST preservation script initially had an extra closing parenthesis; corrected script passed. No product/dependency/configuration repair was made. `pnpm` automatically hydrated this owned checkout's configured dependencies from its existing store on the first invocation.

Docs: not applicable, internal acceptance coverage reuses existing PostgreSQL/Vitest/Prisma patterns without dependency changes.

All five new runtime cases remain **UNREACHED**. Collection, compilation and offline units establish no migration/HTTP/lock/trigger/rollback result. Hosted disposable PostgreSQL execution on the parent's assembled candidate must establish acceptance before final independent review. This is neither final review nor runtime GREEN, and invents no RED. No local services, Docker, Railway, credential search, shared staging, deployment, reset, merge, promotion or store submission was attempted. No additional agents or PRs were created. Root must observe a reached unmet criterion before authorizing production fixes.
