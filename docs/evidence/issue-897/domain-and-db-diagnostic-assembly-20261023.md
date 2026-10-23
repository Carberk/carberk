# Domain and DB diagnostic assembly, 2026-10-23

Bounded assembly for #897/#901/#914 through sole draft [PR904](https://github.com/Carberk/carberk/pull/904). **Partial domain rules and test-only DB diagnostics; no mechanism completion, cause repair, independent review or acceptance claim.** Parent alone publishes the integration candidate and updates PR/issue records.

## Exact inputs and assembled source

Owned worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-dc45e534`. Reservation branch `agent/issue-897-domain-db-diagnostic-assembly-20261023` was pushed before assembly. Scaffold `t3/dc45e534` remains at supplied base `2c2298deb84481c9f3abb3e74f8097162a972023`, tree `8228a6171438e9b1055a4c3f8b353194a71c7cca`. Fetched `origin/main` is `9fde309c3da17f2661fe9c266504e6e56a1b97c9`, tree `d80a13e7baffa0cee19e52897e4264e7964c5352`, and is an ancestor of the supplied base. No main reconciliation was needed.

Each input was inspected and cherry-picked with `-x`, in this order, without conflicts or code corrections:

| Supplied commit | Supplied tree | Assembled commit |
| --- | --- | --- |
| `45a8b549ae988901e3b991190eb13f930bfcc72b` | `df56c2031ec926fd2f9e45b8223bb62c6b45306e` | `ceb4f8716c63d768ff0f06bfbdfc03b188ebd532` |
| `a27e7db0e278486d1beefbcf4ba492b41e0123be` | `09ec4f4d004ce0f0cd0d4f8c983c6941873fd168` | `b12a3782b5980291b11c71c2f123d95665e6a254` |
| `4fa0d40193fc52474d9107643ef2cd7143addf4f` | `c1192570c39b5609b701348c73e381e9da7a8995` | `e28243211b3b30e21e59089b7e618632524594d8` |
| `ca2dc31d9d95438a81c1bc1acb5239e181518438` | `5f49dabbc24d6f5f24034bc50a1e515a5a603a90` | `644765f8caefcb4c3d3f88d2bc8f3dbd91ae49dd` |

Combined verified source is `644765f8caefcb4c3d3f88d2bc8f3dbd91ae49dd`, tree `314f1be64e7c00535ab2a8d9f1123a0450a64631`. This receipt is a later documentation-only checkpoint; its final SHA/tree belong in the external handoff, avoiding a self-reference. Input receipts: [domain checkpoint](public-automatic-ownership-domain-checkpoint-20261023.md), [DB diagnostic](../issue-901/stale-inventory-backend-diagnostic-20261023.md). Also read `/tmp/issue-914-public-ownership-20261023/handoff.json`.

## Combined inspection and preserved behavior

The complete combined diff has no overlapping semantic conflict. The optional ownership rule requires complete original facts and unchanged witnesses on both visits. It cannot authenticate those inputs or discover omitted history. `PrismaDiagnosticContinuityProofs.pair` still supplies only audience, commissioner and physical authorization at issuance (line 157) and consumption (line 229). Public SQL admission still requires `comparative_attestation` in the existing public-continuity migration. Infrastructure, schema/migrations, production reset program and SQL transport implementation are byte-unchanged from base. Public automatic admission remains closed; rejected `f0824f32`/`9c7f7a6f` were not reapplied. No persisted classification, source authentication, ownership capture, irreversible witness, writer lock reconciliation or component erasure/expiry was added.

The DB fixture adds bounded PID/category/lifetime observation through the existing opt-in transport. It changes test observation/timing, not production guards, healthchecks, retries, timeouts or the stale oracle. Backend owner and root cause remain UNKNOWN. Existing hosted RED is [run39899448847/job120237438953](https://github.com/Carberk/carberk/actions/runs/39899448847/job/120237438953): stale row expected `Inventory changed since observation`, received `other database backends present`. Raw `/tmp/carberk-resume-20261021/2c2298-db-job.log` was independently rehashed as `020b8fa4127a0d1fe2fcbd592a02b5bebe9541aa6e865456157fedbf5c1eddec`. A future pass cannot attribute the earlier backend.

`preservation.json` in the log directory confirms all six original DB complete `it()` calls are identical, LF-joined AST-text SHA-256 `779d498463d06a0d9c7a5b791dface648f0027897ca2b1b3f5be9860d47474a1`. Other reset suites and budgets are unchanged. The entire public transfer file remains byte-identical, SHA-256 `ff4d695564d6fde30ee14f7343fd44d5fb1f293a4b847367eaab3ad488b69f4b`. Protected diagnostics and Identity full-v3 suites remain byte-identical, hashes `80816c61234aae876b02558024b8573d718ce0efbee62b7355e69c53ed002213` and `780303324cd2402cd4af10bfe41cff33a1492990780fc7262727b5bd50693779` respectively. No assertion, barrier, budget, skip or original test body was changed.

The retained overview's “Same-visit method-transition acceptance remains unresolved” wording does not reopen policy: the founder has already approved existing supported recording corrections. This assembly adds no new method-transition behavior or acceptance evidence and does not edit the merged ADR.

## Combined offline verification

Logs: `/tmp/issue-897-domain-db-assembly-20261023/`; `log-sha256.json` accompanies the handoff. Results below were collected on the combined source, not inherited as hosted GREEN. Root Turbo results explicitly include valid cache hits; affected domain, DB units, lint and TS6 checks also ran directly. `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test` was configuration-only for builds/root gates, with no service listening or connection attempted by these gates.

| Command | Result / log |
| --- | --- |
| `pnpm --filter @auto-tm/contracts build`; placeholder + `pnpm --filter @auto-tm/db build` | PASS; `contracts-build.log`, `db-build.log` (includes Prisma generation) |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain` | PASS, 9 files / 169 tests, including 34 new ownership cases; `domain.log` |
| `node --test scripts/testing/query-disposable-postgres.test.cjs scripts/staging-clean-reset-remote.test.mjs scripts/staging-clean-reset.test.mjs` | PASS, 37 tests; `reset-contract.log` |
| `pnpm --filter @auto-tm/db test:unit` | PASS, 5 offline lifetime + 119 Vitest tests; `db-unit.log` |
| Placeholder + `pnpm test:unit`; placeholder + `pnpm typecheck` | PASS, 10/10 tasks (9 cached), 11/11 tasks (10 cached); `repo-unit.log`, `repo-typecheck.log` |
| `pnpm --filter @auto-tm/api lint`; `pnpm --filter @auto-tm/db lint` | PASS; `api-lint.log`, `db-lint.log` |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit`; same for DB | PASS; `api-ts6.log`, `db-ts6.log`; TS7 covered by root typecheck |
| Placeholder + `pnpm --filter @auto-tm/api build`; `pnpm check:runtime-imports` | PASS; `api-build.log`, `runtime-imports.log` |
| `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue-897-domain-db-assembly-20261023/collection.config.mts --json` | 22 public-transfer declarations collected; temporary hook-free config, import-only; `http-collection.log` |
| `pnpm --filter @auto-tm/db exec vitest list scripts/staging-clean-reset.e2e.spec.ts --json` | Six original DB cases collected, import-only; `db-collection.log` |
| `pnpm test:agent-docs`; `pnpm check:glossary`; `pnpm test:glossary`; `git diff --check` | PASS; `agent-docs.log`, `glossary.log`, `glossary-tests.log`, `diff-check.log` |

Docs: not applicable — internal assembly only; no external dependency/API change. Documentation-only receipt uses the verification exemption from artificial RED tests. Original source RED evidence remains in the input receipts; no SQL, HTTP or storage body ran here.

## Unresolved gates and handoff

Original required HTTP201 remains RED (run39897093363/API120229988882 on `1d8128d`, actual403); restored-seller/VIN required403 cases remain masked by closed admission. Next domain milestone is classified original ownership capture at first collection, authenticated persisted facts/anchors, irreversible A/B history, complete sorted writer locking, component expiry/third-party erasure and proof-copy handling, followed by SQL integrity/race and ordinary HTTP evidence. Do not infer this mechanism from passing pure domain inputs.

Next DB milestone is the normal full hosted disposable DB gate after parent publication. Retain the stale row child ordinal and same-observation bounded attribution, correlate PID with close/exit records, and preserve both exact stale/no-receipt oracle and intentional extra-backend negative control. Missing/other attribution leaves ownership unresolved; any repair needs evidence rather than a healthcheck assumption.

Parent retains independent fixed-SHA Standards/Spec review, all required normal hosted SQL/HTTP/storage CI, authorized deployed/human acceptance and restoration, signed AAB plus distinct staging APK provenance/joint testing, and remaining release approvals. AAB and staging APK differ in package/origin/certificate and remain pending; existing EAS metadata needs no credential re-request. No inherited GREEN or release readiness is asserted.

No integration push, issue PR, nested agent, Docker/live local service/e2e, CI polling/rerun/dispatch, quota/credential search, Railway retry/bypass, staging operation/reset/deployment, native/emulator interaction, mobile build/signing/key export/store upload or public launch occurred. Three Railway refusals remain terminal; founder's automated native-interaction ban remains effective. Worktree and reservation branch are retained for parent incorporation and later lifecycle cleanup. No children, pending questions or owned processes remain at terminal handoff.
