# Discovery, measurement diagnostics and safe PDF assembly, 2026-10-23

Bounded assembly for #897 and sole integration PR904. Local verification passed. Hosted acceptance and independent review remain parent-owned. This is a pushed checkpoint for incorporation, not integration publication or release readiness.

## Ownership and inclusion

- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-c059623c`.
- Branch: `agent/release897-discovery-diagnostics-assembly-20261023`.
- Host scaffold `t3/c059623c` preserved at base `4538ae99bfdfa2504f81a2e090eec2b6af496384`, tree `72c26ddac1a754d4367b1d8f1c18b3b029623013`.
- Discovery incorporated: `0147d48c60d0dc648f83d45e9974a4f3a7bf0409`, tree `4917943146759038972ed490d8e86e9ae9144c0d`.
- Measurement diagnostics incorporated: `e2374c66660428f05fe7718c05402f9b1493069e`, tree `69f0a6c25780ebf17a980306b31d871990c37133`.
- Finished PDF recovery incorporated after explicit parent steering: `6f95da1216e2d4a92f7f87209f434a3d71029c63`, tree `7fb3b022c756632a568f38366b976f941383ea50`.
- All three original checkpoint SHAs are ancestors of source assembly `0dd9ed599f96c5e9f556dd79eb471173e7380a96`. Their complete source/test/receipt blobs match the assembly exactly. Commit ranges were replayed and checkpoint ancestry retained by merges. Applying the final PDF commit alone initially exposed its missing new-test prerequisite; replaying `defddbccf9305d085da0485fe8bcd0d565e728a5` followed by the final checkpoint resolved that mechanical dependency without a semantic choice.
- Freshly fetched `origin/main` is `9fde309c3da17f2661fe9c266504e6e56a1b97c9`; it is already an ancestor. No main reconciliation was needed.
- Model/effort: gpt-6.1-sol, medium. No nested agent or new worktree. PR904 is linked to this thread; no new PR, integration-branch push, or hosted execution was requested.

## Scope and preservation

Discovery supplies two current-authority private/no-store GET routes, actor/Session/B-bound encrypted continuation, retained graph/rights checks, Identity-owned participant names, contracts and a database-boundary fake extension. Measurement adds sanitized fixed phase/Prisma-code warnings only. It does not repair or explain the earlier unavailable receipt. PDF maintenance reserves one of the existing five slots for the oldest eligible safe replacement and retains four FIFO slots, with unchanged generation authority, leases, attempts, retry windows, historical artifact bytes and source identities.

The worker overview gains one scheduling-constraint sentence under the overview contract. The discovery overview delta is retained; CONTEXT-MAP ownership is unchanged. No API document adapter, public automatic ownership adapter, proof mutation/handoff, reset, schema, config, mobile or UI file changed. No semantic/security issue was found in complete checkpoint and combined diff inspection.

Original test inventory is `discovery-diagnostics-assembly-test-inventory-20261023.json`. All 916 original `.test`/`.spec` JS/TS variants were scanned: 915 are identical blobs. The sole changed original file is `DiagnosticAutomaticVinProof.e2e.spec.ts`, with 32 added lines and zero removed lines. Removing the one 2,341-byte added journey restores the baseline bytes exactly, including every prior test body and assertion. Old blob `9bc2674dee0d5698d82c8b259c35a3a8019fb4f9`; assembled blob `a5fb14f6e418af036fc7f41a2e12162a67d65e71`. Three test files are new: discovery, measurement attribution and safe replacement scheduling. No original worker or measurement test changed.

## RED and GREEN

- Discovery RED `5ce29b2f`: 8 failures on missing routes. Retained GREEN log: 8 passed. Final expanded focused suite: 18 passed, included in this assembly's combined focused 29/29. Original logs remain in `0147d48c` history and the archive.
- Measurement RED `3bedec19`: 9 failed/2 passed. GREEN `473457eda453bd5624c5692bddc79e6e0cbd25c1`: 11 passed. Original hashes independently matched its receipt.
- PDF RED `defddbccf9305d085da0485fe8bcd0d565e728a5`: 3 pending-versus-ready failures. Final-fixture RED also has 3 failures against unchanged worker source. Original RED, final-fixture RED and GREEN hashes independently matched its receipt. Combined real-worker/renderer/database-and-object-boundary suite: 24 passed in 4 files.

Trailing blank lines in the two tracked discovery log copies were trimmed solely to satisfy `git diff --check`; original and normalized SHA256 values are in `discovery-diagnostics-retained-log-hashes-20261023.json`. Original bytes remain in checkpoint history and the verification archive. The preserved source receipts retain their historical claims; current counts below supersede their earlier partial counts/environment failures.

## Combined verification

All commands below exited 0. Builds and root gates used `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder`. No database connection or local service was used. Configured Turbo caching remains enabled.

| Command | Log | Actual result |
|---|---|---|
| `pnpm install --frozen-lockfile` | `install.log` | lockfile accepted; tracked dependency/config files unchanged |
| `pnpm --filter @auto-tm/contracts build` | `contracts-build.log` | pass |
| `pnpm --filter @auto-tm/db build` | `db-build.log` | pass, configured Prisma generation |
| `pnpm test:unit` after all three checkpoints | `combined-unit.log` | 10/10 tasks, 9 cache hits; worker reran |
| `pnpm typecheck` after all three checkpoints | `combined-typecheck.log` | 11/11 tasks, 10 cache hits; worker reran |
| `pnpm --filter @auto-tm/api lint` | `api-lint.log` | pass |
| `pnpm --filter @auto-tm/contracts lint` | `contracts-lint.log` | pass |
| `pnpm --filter @auto-tm/db lint` | `db-lint.log` | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts src/modules/measurement/infrastructure/MeasurementUnavailableDiagnostics.spec.ts` | `focused.log` | 2 files, 29 passed |
| `pnpm --filter @auto-tm/worker lint` | `worker-lint.log` | pass |
| `pnpm --filter @auto-tm/worker typecheck` | `worker-typecheck.log` | pass |
| `pnpm --filter @auto-tm/worker exec tsc6 --noEmit` | `worker-ts6.log` | pass |
| `pnpm --filter @auto-tm/worker build` | `worker-build.log` | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/SafeReplacementScheduling.spec.ts src/jobs/diagnostics/ErasedPredecessorArtifacts.spec.ts src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts src/jobs/PurgeExpiredAccounts.spec.ts` | `worker-focused.log` | 4 files, 24 passed |
| `pnpm check:runtime-imports` | `combined-runtime.log` | both runtime packages pass |
| `pnpm test:agent-docs` | `combined-agent-docs.log` | links/heading/context routes and tests pass |
| `pnpm check:glossary` | `glossary.log` | 31 terms pass |
| `pnpm --filter @auto-tm/contracts openapi:generate` | `openapi.log` | pass, no tracked generated diff |
| `git diff --check 4538ae99` | `combined-diff-check.log` | pass after log whitespace normalization |

Actual unit results: API 272 files, 2,619 passed and 2 skipped; worker 42 files, 297 passed; DB 12 Vitest files/119 passed plus 5 offline tests; contracts 22 files/569 passed; mobile 354 files/3,806 passed; admin 35 files/330 passed; web 17 files/184 passed; SMS 1 file/3 passed. Root agent-GitHub 8 and native-session 29 tests passed. API was freshly run in the first combined discovery/measurement check and replayed from cache in the final three-checkpoint run; worker reran in the final run. Full stdout/stderr and exact SHA256 values are retained, including both runs.

Docs: not applicable, internal assembly of existing dependency contracts; no new external dependency or service contract. Domain layering, Identity public-port imports, unchanged dist runtime boundaries and unchanged dependency manifests/lockfile were inspected. No migration is applicable.

## Acceptance and remaining gates

| Criterion | Evidence | Result |
|---|---|---|
| Exact bounded source assembly and main inclusion | checkpoint ancestry and per-file blob comparisons | PASS |
| Current scoped discovery and sanitized attribution | 29 focused tests and repository gates | Offline PASS |
| Safe replacement scheduling with immutable source/old bytes | 24 worker regressions and worker compile/build/lint | Offline PASS |
| Prior assertions and budgets preserved | 916-file inventory and exact added-journey removal proof | PASS |
| Real discovery HTTP/SQL/storage and final safe PDF HTTP recovery | normal parent-owned hosted disposable lane | UNKNOWN |
| Prior measurement unavailable root cause | no discriminating historical runtime evidence | UNKNOWN |
| Independent Standards/Spec review and full #923 handoff/transport scope | parent integration workflow and later slices | Pending |

Latest parent-supplied exact-base hosted run `39905132872` remains API 3394 PASS/5 FAIL, worker 375 PASS, DB/frontend/static/runtime PASS. The failures were public automatic 403 vs 201, finalized B English replacement PDF 409 vs 200, and three historical reset tails. Measurement currently passes; that does not identify the previous cause. This assembly has no new hosted claim. The PDF source addresses its reproduced scheduling cause, while hosted recovery stays UNKNOWN.

No local Docker/services/e2e, CI dispatch/rerun/poll, Railway/deployment/reset, credentials/proxy/quota probes, device/emulator/browser, signing build or store action occurred. Prior Railway refusals remain terminal. Later joint manual testing remains parent/founder-owned.

Logs directory: `/tmp/carberk-897-discovery-diagnostics-assembly-20261023`. Full log SHA256 manifest: `discovery-diagnostics-assembly-log-hashes-20261023.json`. Archive: `/tmp/carberk-897-discovery-diagnostics-assembly-20261023/verification-logs.tar.gz`, SHA256 `cbaa415b2aa1bba375568cfefaf75e3d32e803cc6a0a09f7397c9c4fa8748901`.
