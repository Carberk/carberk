# Classified fixture and erasure oracle correction, 2026-10-23

This checkpoint is limited to the two allowed API e2e fixtures and this evidence note. It starts at `5c699b4fe2d3363eb6e416213b6007d5c49c8588` (tree `f0a8976c1f89bbdc4c438a7aba08a77df1431220`) and reserves `agent/issue-914-classified-fixture-correction-20261023`. PR #904 is the sole draft integration PR.

The supplied hosted baseline from `5c699b` is API `3473 PASS / 27 FAIL` and worker `375 PASS / 3 locale five-second timeouts`. The API plain log is `/tmp/carberk-resume-20261021/5c699-api.plain.log`, raw SHA-256 `aec566c91656bf31d90d8034aed039c63287f25a8116985b47c537ca7682454e`, and the plain copy SHA-256 is `a38792354b3b8a7e78757ce9d988c97779035e1dd4d02ef3c93ea7573b82f1b1`. The exact counter scan still finds 21 `DiagnosticClassifiedOwnership` failures: 20 `visit()` helper `403` versus `201` failures and one dependent missing-raw failure. This receipt does not claim local HTTP acceptance.

The startup host scaffold `t3/baaabf9d` remains at the supplied base. The reservation was pushed before edits. The parent owns publishing, integration, review and the execution-state update.

Earlier evidence remains separate: run `39946417121`, API job `120390590868`, candidate `b49ca212` had API `3473 PASS / 27 FAIL`, worker `377 PASS / 1 timeout`. Raw `/tmp/carberk-resume-20261021/b49-api.log` SHA-256 is `5d5b50e233fd042f73dfef459f932ccc80cc9b34dc95907851f13735a002bd6f`; its plain copy is `63358ab2efc2ad00b763eb84b5c5f604778dc082f33c8d85db08f890355f9703`. New run `39948552244` has the same API failure groups: 21 classified + 1 loopback + 1 identity-erasure + 1 public automatic + 3 historical tails. The log combines API and worker output; a blind FAIL-header count also includes worker locale failures. The parent reports DB/frontend GREEN only.

## Corrections

`DiagnosticClassifiedOwnership.e2e.spec.ts` previously assigned `unrelated` and `graphSeller` as `diagnostics.reviewer` staff. The fixture creates them as ordinary source principals and does not create reviewer staff grants or center qualifications for them. `PrismaDiagnosticIntake.assign` requires both a live scoped staff grant and a qualified center assignment. The hosted 403 therefore occurs at the assignment helper on line 113, before the vehicle intake path. The corrected fixture assigns only `reviewer` and `replacementReviewer`, which are provisioned with the required grant and qualification. The two ordinary principals remain available for commissioner/seller replacement and graph-expansion assertions.

The proposed missing-contact/publisher hypothesis was not supported. Personal intake at `PrismaDiagnosticIntake.ts:75-80` checks current Listing status and seller; Business intake uses ordinary `BusinessAuthorityPort.authorize`. Current Session/account state is checked by `DiagnosticAuthority.current` through `CheckBusinessAuthority.resolve`. Neither path requires adding a Verified Contact Phone to this fixture. `PrismaPublisherBindings.bind` is a separate nonacting participant contract; it supplies no reason to bypass staff assignment. The glossary distinguishes Verified Contact Phone from Sign-in Method.

The same file contained the literal `.ready()` substring in the worker callback (`control.ready()`), which violated the static loopback invariant even though the app listener is already `listen(0, "127.0.0.1")`. The callback was renamed to `onReady` at the local test seam and its behavior is unchanged.

`DiagnosticIdentityErasure.e2e.spec.ts` expected the raw row's `ownershipCaptureTransaction` to survive erasure. The committed migration `20261023090000_diagnostic_ownership_components/migration.sql` defines the server trigger to clear this server-only receipt whenever `erasedAt` is set. The worker erasure statement clears observation, hash and recorder attribution before intake erasure. The corrected oracle expects `ownershipCaptureTransaction: null`; it preserves raw row identity, order/version, erased timestamp, foreign rows, report pins, retry binding, assignment cleanup, and all denial/public-disclosure assertions.

Policy authority is [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md), assigned/qualified staff and classified retention; [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md), audience and data lifecycle; and [feature 50](../../prd/features/50-reports-tier.md), data rights and retention. The existing [capture receipt](../issue-914/classified-forward-capture-receipt-20261023.md) explicitly documents that the raw server-only transaction receipt clears on erasure. This is transaction authentication metadata, not an ownership-history witness. The migration at lines 7-18 and worker `diagnosticAccountErasure.ts:87-91` establish current implementation. The hosted diff shows the old oracle retaining transaction IDs `20619` and `20624`, while actual rows have NULL. No new preservation right is inferred.

No production source, schema, migration, runtime gate, identity bypass, port, clock, budget, rights, skip, or security assertion changed.

## Verification

The following commands were run without starting local services, listeners, databases, Docker, HTTP, TLS, SMTP, browser, device or emulator infrastructure:

- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/e2e-loopback.spec.ts` passed, 63 tests, after the callback correction.
- Focused API ESLint passed for both changed specs.
- `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit` passed.
- `pnpm --filter @auto-tm/api build` passed.
- `pnpm --filter @auto-tm/contracts build` passed.
- `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test pnpm --filter @auto-tm/db build` passed as an offline configuration-only build; no connection was attempted.
- `pnpm check:agent-docs` and `pnpm check:glossary` passed.
- `git diff --check` passed.
- Import/declaration audit parsed both changed TypeScript files and confirmed their import/export declarations match the supplied base without executing project imports.

The API e2e suite, SQL disposal/erasure paths, worker e2e suite, and hosted rerun remain real-runtime evidence gates. They were not run under this bounded writer instruction, so their status is `UNKNOWN` here. All worker locale timeouts remain recorded and were not retried.

The preservation audit reports 931 tracked test files, with only the two allowed existing test files changed and 929 other test files byte-identical. The exact audit is in `/tmp/carberk-classified-fixture-correction-20261023/preservation-audit.log`.

## Exact before/after and assertion audit

| Location | Before | After |
| --- | --- | --- |
| Reviewer fixture assignment loop | reviewer, replacementReviewer, unrelated, graphSeller | reviewer, replacementReviewer |
| Worker control type, invocation and caller key | ready | onReady |
| Erased raw full-row oracle | spread retained transaction receipt | explicit `ownershipCaptureTransaction: null` |

Reversing exactly these edits reproduces both base files byte-for-byte. Every test title, test body assertion and HTTP status assertion is preserved except the explicit erased-row receipt expectation. Removing invalid setup assignments grants no extra authority. All 401/403 denials and no-write assertions, malformed/expired input checks, SQL attacks, exact-expiry fences, both race variants and unchanged budgets, graph-change refusal, foreign component/raw/report-pin equality, consumed retry and changed-proof conflict, independent release, and recorder/declarer detachment remain present. In identity erasure, independent foreign rows, retained raw/hashes/versions/timestamps, report pins, private/no-store and generic refusal equivalence, current attribution and authority cleanup remain present.

No new pure fixture helper was introduced. No applicable existing pure fixture check exercises these local SQL-backed setup loops; only the named static loopback test was run. Runtime import execution was omitted; static TypeScript declaration parsing executed no project hooks.

The initial loopback attempt failed during import before any test because built DB exports were absent. Contracts built successfully; the first DB build refused missing `DATABASE_URL`. The corrected offline build used only the documented placeholder URL for Prisma generation and compilation. These are setup failures, not behavioral RED or HTTP evidence. The supplied hosted run remains the HTTP/SQL failure evidence. A later permitted offline loopback run reproduced the exact `.ready()` failure with 62 passed / 1 failed before the callback rename; the corrected file passes all 63 tests. This static RED/GREEN does not execute the classified or erasure suite.

## Command and artifact manifest

All logs are under `/tmp/carberk-classified-fixture-correction-20261023/`. Successful checks refer to the edited test files; docs checks were repeated after writing this receipt. Empty successful logs retain the empty-file SHA-256.

```text
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  agent-docs-final.log
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  agent-docs.log
9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538  api-build.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-lint-final.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-ts6.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  api-typecheck.log
b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616  contracts-build.log
3b406ebcf7408221d26e842865ad18eb1259c4b66e7edd118fa9745aac65f91c  db-build-offline.log
a9aced6803ca55a22e58d04fb5c1f082700ed4fd2569f1d6fd0c8669b8261cd8  db-build.log
d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621  glossary-final.log
d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621  glossary.log
9f38c0e476c74e9aad8725d6a32158a6228cda3455f4354a30b14d556b322dc1  import-declarations.log
55a1706df48d018be2f9c08dd7408d3c300bb4646a2616950a1e595c71b8d59b  loopback-after.log
fdc2c9c5d03ce4ff59b9bef5aab428f9469d36375a4983c1cd5431b8e89e72c3  loopback-before.log
aefd2e556917dcc3c0b42fb058697ac4a3f8a719fd8511ae457d2f54646cf0f7  loopback-green-final.log
6b36634c16029b368fc2ac16433389d8943df047177c336ea26ebfd86c155e2d  loopback-green.log
b893d4d1c9e3d6de288679344c145eeca5aa449a4b32d4b2145fa20506d0438a  loopback-red.log
2ca1329cdb24bb340262da13e0310c803c2daea26fc984b818936ba0c64532fc  preservation-audit.log
```

Additional exact commands: `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts`; `git diff 5c699b4fe2d3363eb6e416213b6007d5c49c8588 -- apps/api/src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts`. The latter is saved as `test-changes.patch`.

```text
23e4691e4036ef0b9e62187e88cc12886803519b2b995482207a94b9ce6415f4  test-changes.patch
48b6bbe5aa98d087f7097b7e9429b32cd77fffcf4d2a405e56c1f8b04033d1ab  BASE apps/api/src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts
5a69ac24961f304ebd67cba844e83b2f3c1a537257d3b7982871aa965976d122  AFTER apps/api/src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts
e7648f57313241b6c9b12b21e5adf0502fa3a0d99dd4311ecebb3a45fce8546d  BASE apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts
e9fac68489e0f14aabc8416fbdb227b7c0c36c1b1d6d6d0a2360fe525223245d  AFTER apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityErasure.e2e.spec.ts
```

Real HTTP positives, SQL integrity/erasure/locking and worker acceptance remain UNKNOWN. The three Railway refusals and capped worker timeout attempts are terminal; this checkpoint makes no new infrastructure attempt or timeout workaround. No CI polling/rerun/dispatch, integration push or new PR was performed.

Docs: no external dependency/API behavior changed; no external documentation lookup required. The local diagnostics skill was applied using supplied hosted failures, with local HTTP reproduction excluded by the writer brief.
