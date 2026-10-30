# Erased predecessor current readers: source checkpoint

Base `b7411ba51ae4a5a77f3b5d1fb87cb388bf08499d`, tree `15476ec5116bf44d992850be0805f5d440f1bab0`. Sole bounded #914/#897 writer on `agent/issue-914-erased-predecessor-readers-20261023`, host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-e6278560`; scaffold `t3/e6278560` remains at base. Parent assembles through existing draft [PR904](https://github.com/Carberk/carberk/pull/904). No children, issue PR or integration push.

Production/test checkpoint: `b181889dcebf056b661cdc166b6fee80b0c0f97d`, tree `a1c6840ad71cefce82aa4a3427daf896dd55e5f7`, pushed to the writer branch. This receipt follows in a documentation commit; final handoff pins that commit too.

## Proven cause and fixed paths

The adapters returned the immutable B report's historical `successorOf` directly. Its PDF intents always selected renderer `v1`, whose worker rendered the same unprojected snapshot. Erasing A did not change B's artifact identity or epoch, so the existing post-storage check accepted the same old A-bearing artifact across erasure. Maintenance had no replacement discovery for an already issued B copy. The purge's order/report lock discovery also omitted surviving direct successor orders.

`@auto-tm/db` now owns one current-reader projection. It validates report id, order id and predecessor binding against the immutable row. For a missing or erased predecessor or erased predecessor order it returns a copy with `successorOf` and `correctionReason` null. It does not edit persisted state, released snapshots or their source hashes. No arbitrary text replacement or locale-specific allowlist is involved.

- Public JSON and commissioner/current staff DTO reads, order report lists and ordinary write responses use that projection. Existing `DiagnosticReportAccess` and current Identity authority remain in force. Exact reinspection mutation retries retain their historical receipt and persisted consumption binding after the existing current B authority checks; they do not reopen A reads or comparison rights.
- Document list/current download selects the matching projection renderer. An obsolete document is unavailable until a safe replacement exists. The existing second authorization after storage I/O now also checks the current projection renderer, alongside exact artifact identity, epoch, key, hash and size. It cannot return a held old download after A erasure or fall back to stale bytes.
- Finalization requests TK/RU/EN intents with the current projection renderer, including draft B finalized after A erasure. The worker validates the original canonical source hash/schema/binding and renders the projected report through the existing locale renderer.
- Maintenance discovers obsolete direct-lineage artifacts and creates distinct `v1-erased-lineage` intents with a new id, exact object key and generation, retaining the original source snapshot hash. A pending old-id generation can generate its safe replacement after releasing the transaction. Repeated discovery reuses the safe intent. Ready issued historical rows and bytes stay unchanged and are excluded from current delivery. Unfinished obsolete writes follow existing epoch, lease and exact-object cleanup; post-I/O checks refuse late adoption.
- Purge discovers the full commissioner/staff/direct-successor affected order union, locks personal Listings before sorted orders and sorted reports, then performs existing erasure writes. It records the order set in a transaction-local setting and revalidates after waits. A changed set aborts with `diagnostic_erasure_lock_set_changed` instead of adding locks after A. Readers/workers holding B do not lock A in reverse order. No B report, issued artifact or surviving B Listing is erased by this extension.

The existing artifact identity trigger forbids changing renderer identity even while pending. A development test enforcement caught that approach (`artifact-identity-red.log`); the final implementation creates fresh intents and never updates identity fields. No schema, migration, dependency, lockfile, retention timer, hold/collection policy or ownership mechanism changed.

## RED evidence

Primary hosted RED is the supplied exact-base b741 run39902267267/API120246339103. Both draft/finalized A-only-purge cases genuinely reach JSON/PDF/privacy/held-I/O/distinct-replacement assertions. Raw `/tmp/carberk-resume-20261021/b741-api.log` SHA256 `0faa2b760e5824a145ecfa290a1d07ad7eaf0759bc4def6159e1b174aafb40fb`; stripped `b741-api.plain.log`. API 3388 PASS/7 FAIL, 338 files PASS/3 FAIL; worker 373 PASS. DB full gate passes on b741. This is RED evidence, not acceptance of this fix.

Prior run39897093363/API120229988882 has the same targeted reached failures. Raw `/tmp/carberk-resume-20261021/1d8128-api.log` SHA256 `e7e40ad90161ccaf950f75c268dc55048af6a473b692a1213fee9f0b5ce4b305`. Both raw hashes were independently checked. Earlier extra-backend attribution remains UNKNOWN.

Offline failing tests were committed and pushed **before production edits** at `d6c3fe17` (`test(diagnostics): expose erased predecessor reader and PDF races`). Logs are under `/tmp/issue-914-erased-readers-20261023/`:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/infrastructure/ErasedPredecessorReaders.spec.ts
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/ErasedPredecessorArtifacts.spec.ts
```

`api-red.log`: two genuine failures, public JSON retains A and held download resolves with A-bearing bytes. `worker-red.log`: two genuine failures, real TK/RU/EN PDF text retains A/old EN identity and held PUT is adopted ready. An earlier import setup error was corrected before these RED runs and is not behavioral evidence.

## GREEN and preservation

The same regression files pass with the fix. Expanded commands:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/infrastructure/ErasedPredecessorReaders.spec.ts src/modules/identity/presentation/DiagnosticErasedPredecessorReaders.spec.ts
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/ErasedPredecessorArtifacts.spec.ts src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts src/jobs/PurgeExpiredAccounts.spec.ts
```

`api-green.log`: 2 files/4 tests PASS. `worker-green.log`: 3 files/21 tests PASS. Tests use real adapters, Identity business/staff authority and artifact worker/renderer with generic CRUD/filter/CAS database and exact-object storage fakes. They check immutable B source, findings/date/mileage/evidence preservation, all three PDF locales, distinct replacement/idempotence, held read/PUT fences, bounded lease cleanup, unrelated object retention, exact retry equality and outsider/revoked staff refusal. Real PDF text decoding uses existing pdf-lib embedded font/Unicode data, with a positive original A-bearing PDF assertion; it needs no undeclared host PDF executable. Fakes enforce artifact identity immutability but do not simulate erasure SQL or row locks.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Current public/commissioner/staff JSON excludes erased A linkage | New API regression files | Offline PASS |
| Current TK/RU/EN PDF uses distinct safe replacement | Real renderer/worker regression | Offline PASS |
| Held read and late PUT cannot deliver/adopt obsolete bytes | Adapter/worker race regressions | Offline PASS |
| B immutable source, exact retry, current authority and cleanup isolation | API/worker regressions and unchanged existing unit suites | Offline PASS |
| Entire original public-transfer and protected test bodies/assertions/budgets preserved | `preservation.json`, compared against base | PASS |
| Purge SQL lock ordering, full HTTP lifecycle and actual storage behavior | Parent normal hosted CI after assembly | UNKNOWN |

All **602** original `.spec.ts`/`.test.mjs`/`.test.cjs` files are byte-identical to base. Public transfer file SHA256 remains `ff4d695564d6fde30ee14f7343fd44d5fb1f293a4b847367eaab3ad488b69f4b`. No original e2e file changed.

Configured dependency builds/Prisma generation used only `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test`. Verification logs in the same directory:

- `pnpm --filter @auto-tm/contracts build`, `pnpm --filter @auto-tm/db build`: PASS (`contracts-build.log`, `db-build-green.log`).
- `pnpm test:unit`: 10/10 tasks PASS, latest 9 cached (`repo-unit.log`); API 2590 PASS/2 existing skipped, worker 294 PASS. No container-backed e2e suite ran.
- `pnpm typecheck`: 11/11 tasks PASS, latest 10 cached (`repo-typecheck.log`), configured TS7 gates. `pnpm --filter <package> exec tsc6 --noEmit` for API, worker and DB: PASS (`api-ts6.log`, `worker-ts6.log`, `db-ts6.log`).
- `pnpm --filter <package> lint` for API, worker and DB: PASS (`api-lint.log`, `worker-lint.log`, `db-lint.log`).
- API/worker `build` and `pnpm check:runtime-imports`: PASS (`api-build.log`, `worker-build.log`, `runtime-imports.log`). Shared testing export targets compiled output under `@auto-tm/db/testing`.
- `pnpm test:agent-docs`, `pnpm check:glossary`, `pnpm test:glossary`: PASS (`docs.log`); `git diff --check`: PASS. Owning API/worker context updated.

Docs: no external lookup required; existing internal Prisma/storage/renderer contracts and installed dependencies only, no new external service/API or version.

## Remaining gates and boundaries

Hosted HTTP/SQL/storage acceptance is **UNKNOWN** until parent assembly and normal hosted CI. Offline fixtures represent committed A erasure; they cannot prove database lock interleavings, trigger execution or deployed object storage. Independent fixed-SHA Standards/Spec review and release gates remain pending; this writer does not approve them.

Automatic public admission 403-vs-201, Support barrier 2299, publish+attach 3288, Improvement unavailable-vs-accepted lines 73/83, and earlier backend attribution stay outside this defect. Existing unused/consumed proof lifecycle, other orders/users and worker erasure coverage remain in the unchanged suites. No staging/Railway operation, local service/e2e, CI dispatch/polling, device session, mobile build/signing/upload or release action was performed. Founder joint testing and signed-AAB/distinct-staging-companion goals are not marked ready by this checkpoint.
