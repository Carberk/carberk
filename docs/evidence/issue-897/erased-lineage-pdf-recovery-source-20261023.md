# Erased-lineage PDF recovery source evidence, 2026-10-23

Writer reservation: `agent/issue-914-safe-pdf-recovery-20261023`, in host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-7f4fdda4`. Supplied base `4538ae99bfdfa2504f81a2e090eec2b6af496384`, tree `72c26ddac1a754d4367b1d8f1c18b3b029623013`. Sole integration draft remains [PR #904](https://github.com/Carberk/carberk/pull/904). Parent owns assembly, execution-state/PR records, independent review and hosted acceptance. No nested writer or additional worktree was created.

## Cause

The safe replacement intent was discovered correctly by `replaceErasedLineage()`, but `execute()` selected one global FIFO batch of five artifact rows. Older pending or due retry work could fill that batch before the newly-created `v1-erased-lineage` intent. The replacement then remained `pending`, so the current document reader returned its existing unavailable response. The proven defect is a batch scheduling delay: a valid replacement can miss the single existing maintenance pass. Rendering and storage have not been attempted for that pending row. No timeout or flakiness attribution is needed.

The protected HTTP helper at `DiagnosticPublicTransferProof.e2e.spec.ts:1331` first generates exactly the requested TK/RU ids, then calls `execute()` once. The finalized case already issued EN at line 1436. Its held download performs A purge after real storage I/O at lines 1502-1525; the document adapter rechecks current projection and refuses the old EN. The subsequent TK/RU generations create and finish their own safe intents. They do not finish EN. Only replacement discovery and batch selection can recover EN during the one maintenance pass at line 1565.

This suite has no per-test teardown. Earlier `release()` and `finalizeLinked()` calls leave three durable locale intents per release until `afterAll`. The old batch sorts these older intents before a replacement created during maintenance. The supplied exact-head log confirms the reached EN 409 at line 1579. Its raw SHA256 was independently verified as `1869320491913b3f986d07901b469287e581275f71ba6f3717e90d98d52d9423`. That run did not capture the selected artifact ids; the deterministic lifecycle reproduction establishes the scheduler defect, while exact-head hosted recovery remains to be demonstrated.

The initial worker regression in `ErasedPredecessorArtifacts.spec.ts` had only B's locale intents. It exercised discovery, rendering and fencing, but had no older release backlog. It therefore passed without covering this scheduling case.

## RED

The test `apps/worker/src/jobs/diagnostics/SafeReplacementScheduling.spec.ts` was added before the production change and pushed at `defddbccf9305d085da0485fe8bcd0d565e728a5`, tree `f940980bbdc2aba5ea3b49fb9b65896177061ee7`.

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/SafeReplacementScheduling.spec.ts
```

`/tmp/issue-914-safe-pdf-recovery-20261023/red.log` recorded 3 failures, with no setup/import failure. TK, RU, and EN safe replacement rows existed but were still `pending` after one ordinary `execute()` pass.

## Fix and GREEN

`execute()` now reserves one of the existing five slots for the oldest eligible `v1-erased-lineage` replacement and fills the remaining four slots in the existing FIFO order. When no replacement exists, the original five-row FIFO selection remains unchanged. Generation still rechecks the report lock, epoch, lease, current projection, exact object key, hash and size. No attempts, retry windows, deadlines, or storage cleanup rules changed.

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run \
  src/jobs/diagnostics/SafeReplacementScheduling.spec.ts \
  src/jobs/diagnostics/ErasedPredecessorArtifacts.spec.ts \
  src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts \
  src/jobs/PurgeExpiredAccounts.spec.ts
```

`/tmp/issue-914-safe-pdf-recovery-20261023/green.log`: 4 files, 24 tests passed. The new regression covers all three locales, old issued bytes, immutable B source, distinct replacement ids, pending and due-retry older work, exact unrelated object retention, and a second sweep that drains the ordinary tail without creating another replacement.

The test fake does not model expired lease dates correctly because its generic matcher compares cloned `Date` objects by reference. The initial fixed-source run recovered all three safe locales but its ordinary-work count exposed that fake limitation. The fixture was narrowed to pending/due-retry rows without changing the shared fake or product lease behavior. The final fixture was then checked against the unchanged base worker again, producing the same three pending-versus-ready failures in `final-fixture-red.log`; restoring the fixed worker produced GREEN again. Lease and late-write behavior remains covered by the existing `ErasedPredecessorArtifacts.spec.ts` tests and hosted storage/SQL acceptance remains UNKNOWN.

Log SHA256 values under `/tmp/issue-914-safe-pdf-recovery-20261023/`:

- `red.log`: `85f2beb8f2c9f9f95e7135f7641d7e71e6851df3ba24b7e5df93d91e3f3425cb`.
- `final-fixture-red.log`: `c06d6bd35f1166bd888f3ba00353be4e0bf9450dfe607bb7c98e15f004238461`.
- `green.log`: `74c7c823528dce267c743c9c5ce46d427ffc1c9d157d3d7baf0c99ef13c9c759`.

## Preservation and checks

The old unsafe artifact and its historical exact object bytes remain unchanged; current API delivery continues to refuse that renderer after erasure. The safe replacement has a distinct id and exact object key. TK/RU/EN use the canonical erased-lineage projection. No API document adapter, report/snapshot, continuity proof, identity authority, purge, measurement, reset, or frontend source changed. No old bytes are served, and no locale-specific branch or extra maintenance loop was added.

- `pnpm test:unit`: PASS, 10/10 tasks; worker 297 tests.
- `pnpm typecheck`: PASS, 11/11 tasks.
- `pnpm --filter @auto-tm/worker lint`: PASS.
- `pnpm --filter @auto-tm/worker typecheck`: PASS.
- `pnpm --filter @auto-tm/worker exec tsc6 --noEmit`: PASS.
- `pnpm --filter @auto-tm/worker build`: PASS.
- `pnpm check:runtime-imports`: PASS.
- `pnpm test:agent-docs`: PASS.
- `git diff --check`: PASS.
- All **605** original `.spec.ts`/`.test.mjs`/`.test.cjs` files are byte-identical to supplied base, including protected HTTP tests, assertions and budgets. `preservation.json` records no changed original tests. Protected HTTP file SHA256 stays `ff4d695564d6fde30ee14f7343fd44d5fb1f293a4b847367eaab3ad488b69f4b`.

The first RED test checkpoint contained an expired-processing fixture row. That row did not affect the observed RED symptom. Its fake-only CAS limitation was found after the source fix, as described above. No existing test was edited to accommodate this.

Both configured dependency builds passed, with DB generation using only `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test`. Dependency installation used `pnpm install --frozen-lockfile --offline`; no dependency, lockfile, schema or migration changed. Docs: no external lookup needed; this uses existing internal Prisma/worker contracts and installed dependencies only.

## Scheduling and integration implications

Replacement selection is locale-independent, with the same `createdAt,id` ordering and eligibility for pending, due failed or expired processing rows. Attempts-exhausted finalization still precedes selection. Selection grants no extra generation or cleanup authority: `generate()` keeps its transactional current-projection, lease, attempt and epoch checks. The batch still has at most five selected rows and uses the same cleanup pass afterward. No extra execution cycles or retries were added to recover the assertion.

One reserved slot makes replacement progress independent of an older ordinary backlog. The other four slots retain FIFO progression for all eligible work; a sweep without a replacement still uses all five. Multiple queued replacements progress in their existing order rather than all bypassing the budget. This proves the reached single replacement case, not a universal one-sweep readiness guarantee for an arbitrary backlog.

No shared context was edited. Proposed parent overview delta for the diagnostic worker paragraph: mention that ordinary maintenance reserves one of its five generation slots for the oldest eligible safe projection replacement, keeping four FIFO slots and existing lease/cleanup semantics.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Reached safe replacement recovery within existing maintenance pass | Three-locale real worker/renderer/object lifecycle with six older pending/due-retry intents | Offline PASS |
| B source, historical bytes, exact distinct replacement and current locale parity | New lifecycle assertions plus unchanged erasure/renderer regressions | Offline PASS |
| Existing held-read gate, late PUT fence and exact lease cleanup remain intact | No adapter/lease/cleanup changes; unchanged worker erasure tests pass; original HTTP body hash unchanged | Offline PASS; hosted UNKNOWN |
| Full original HTTP/SQL/storage lifecycle | Parent's normal hosted candidate gate | UNKNOWN |

Hosted HTTP/SQL/storage GREEN is parent-owned and remains UNKNOWN here. No Docker, local live service, staging, Railway, CI dispatch/polling, native session, or deployment action was performed.
