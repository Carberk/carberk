# Public lineage all-locale recovery acceptance, 2026-10-22

This is a test-only checkpoint for release #897/#914, integration PR #904. Hosted PDF and recovery behavior is UNKNOWN. No lifecycle body ran here, so this note records no reached RED. The existing JSON erasure RED from the parent's exact `64f96` candidate is separate evidence.

## Provenance and scope

The isolated T3 worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-fc30fcda`, branch `t3/fc30fcda`. Its inspected starting HEAD was `c2d681bcc84ced709208985796b26f0993125925`, tree `eeba40cb1928be8d7e295ef708cda73ec3e777eb`, with clean status. It matches the supplied parent base. No parent checkout was changed. The only tracked changes are the public transfer HTTP lifecycle spec and this note. No push, GitHub write, CI polling, service startup, Docker, Railway access or child delegation occurred.

The task follows the [next source contract](public-lineage-next-source-contract-20261022.md). Required guidance read includes AGENTS, CONTEXT-MAP, API/diagnostics/worker overviews, coding workflow, coding standards, VERIFICATION, domain guidance, glossary and worktree lifecycle. Existing implementation ownership and overview claims do not change.

## Exact maintenance action and acceptance

The same draft/finalized account-purge journey remains. In the finalized path, the existing helper still generates the original EN artifact before erasure. After real storage I/O triggers A's product purge, the helper generates the existing pending TK/RU intents and calls `DiagnosticArtifactWorker.execute()` exactly once, in its existing isolated worker subprocess with real Postgres, private S3 storage and embedded fonts. The existing runtime clock remains `2026-10-21T12:00:00.000Z`. Existing subprocess and suite timeouts remain unchanged. There are no sleeps, retries, row inserts, artifact-state resets or replacement creation in test setup.

The ordinary pass is global. Before generation/maintenance, new guards require every diagnostic order, report, PDF, identity record, identity evidence, provenance and proof row to belong to the suite's pre-registered IDs. Finding evidence must be absent in this fixture, and all existing PDF/provenance object keys must already be registered. Existing hosted-only, worker URL/database, localhost MinIO, bucket and exact generation guards remain. Replacement IDs are registered only from the requested B report's public document list, using the existing exact object-key contract; teardown's ownership and exact-key checks remain intact.

After that pass, the test reads B's current public document list and downloads TK/RU/EN by locale. Each must return 200, private/no-store PDF bytes, a ready list descriptor, B's report/finding/template IDs, finalized observation date and mileage. Decoded text must exclude every existing A-secret assertion. A failed download still checks that its list descriptor does not advertise ready, then fails the hard availability assertion. EN denial is no longer an accepted terminal outcome. When the issued EN contained A, recovered EN must have a distinct current artifact ID and distinct bytes.

Exact historical EN row equality and storage-byte equality now run immediately after maintenance, before recovery assertions. B's exact release row equality, current JSON findings/date/mileage/template and null predecessor checks, restricted-material denial, independent writes/finalization/withdrawal, draft path, storage-I/O erasure and guarded cleanup remain. JSON and PDFs assert the same permissible B content and absence of A material. The locale route may serve a safe replacement; the test does not demand denial of every post-purge request.

## Source basis and expected missing behavior

- [Worker availability and generation](../../../apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts#L25) admit pending, due failed or expired processing artifacts. Ready artifacts are excluded.
- [Ordinary worker pass](../../../apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts#L119) selects at most five pending/retry candidates, calls generation and cleanup. [Cleanup](../../../apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts#L189) fences erased reports and handles exact object cleanup; it has no supported ready-artifact predecessor reconciliation action. The test uses this real pass rather than inventing one.
- [Rendering](../../../apps/worker/src/jobs/diagnostics/DiagnosticPdfRenderer.ts#L76) prints the immutable snapshot's predecessor. [Worker current eligibility](../../../apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts#L34) checks B's own snapshot/erasure but does not derive current A disclosure permission.
- [Public list and locale selection](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticDocuments.ts#L23) choose the current per-locale artifact. [Download](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticDocuments.ts#L44) rechecks selection after storage I/O. The test preserves this boundary without selecting a replacement architecture.
- [Public JSON](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticPublic.ts#L36) spreads the released report snapshot. Existing JSON erasure assertions remain soft so later PDF criteria can be reached.

At this base, source inspection predicts that ordinary maintenance cannot replace the ready A-bearing EN copy. A privacy-only denial fix would now fail the explicit EN availability assertion. The current unsafe-success behavior should fail content/identity assertions. These are predictions, not reached results. Hosted disposable-service execution must distinguish behavioral RED from setup, isolation, render or storage errors before production implementation proceeds.

## Offline verification

Commands ran from the isolated worktree root unless stated otherwise.

| Command | Result |
|---|---|
| `pnpm install --offline --frozen-lockfile` | PASS, 2034 packages reused, zero downloads; no tracked dependency changes |
| `pnpm --filter @auto-tm/contracts build` | PASS |
| `pnpm --filter @auto-tm/db build` | Initial prerequisite failure: Prisma config required DATABASE_URL; no connection attempted |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build` | PASS, generated client and compiled package only; dummy non-service URL |
| `pnpm --filter @auto-tm/api typecheck` | PASS, configured TS7 |
| `node node_modules/typescript/bin/tsc6 --noEmit -p apps/api/tsconfig.json` | PASS, TS6 |
| `pnpm --filter @auto-tm/api lint` | PASS, full affected workspace |
| `pnpm --filter @auto-tm/api build` | PASS, Nest build |
| `pnpm --filter @auto-tm/api test:unit` | PASS, 267 files, 2552 tests passed, 2 skipped; hosted e2e excluded |
| `pnpm check:agent-docs` | PASS |
| `git diff --check` | PASS |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list --config /tmp/carberk-all-locale-recovery-20261022/collect.config.mts --staticParse=false --json=/tmp/carberk-all-locale-recovery-20261022/collection.json` | PASS, 21 imported cases including both account-purge phases; no setup/hooks/bodies |

A supplemental `node` stdin syntax check extracted the helper's actual script template with the installed TypeScript AST, substituted inert fixture values and parsed it with `vm.Script` for both maintenance modes. Both parsed successfully; neither script executed. This does not verify worker behavior.

Collection used a temporary config with root set to this worktree's `apps/api`, `globals: true`, `setupFiles: []`, `globalSetup: []`, `maxWorkers: 1`, and only `src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts` included. This invokes actual import collection rather than static parsing. Temporary collection artifacts and the API unit log are under `/tmp/carberk-all-locale-recovery-20261022`.

The affected spec diff is 52 additions and 31 removals. It extends the existing helper and replaces the optional EN recovery branch with required current downloads for all three locales, retaining privacy and immutable-history assertions. Inspect the complete patch with `git show -- apps/api/src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts` on this checkpoint.

Hosted lifecycle bodies, the ordinary maintenance subprocess and new availability RED remain unexecuted. Parent CI `39870448703` was supplied as live at codec installation; this writer neither inspected nor published over it. Root owns hosted disposable-service RED, subsequent implementation, independent review and final integration gates. Repository-wide tests/typechecks and deployed acceptance were outside this bounded writer's verification.

Docs: not applicable. This change uses existing internal production worker and public HTTP contracts; no external dependency API, service, version, schema, configuration or architecture changed.
