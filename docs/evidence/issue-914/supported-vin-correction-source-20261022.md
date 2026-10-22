# Supported VIN recording correction source handoff

This bounded #914/#897 implementation starts at the exact supplied base `070bd66c03a1efc5426f77dc5ee56ca96236e93e`. The owned host checkout is `/Users/bagtyyar/.t3/worktrees/carberk/t3-0f4207b4`; its clean scaffold branch was `t3/0f4207b4` at that base. Reservation `agent/issue-914-supported-vin-correction-20261022` was pushed before edits. Root alone owns `agent/release897-resume-assembly-20261021`, assembly and publication through [draft integration PR #904](https://github.com/Carberk/carberk/pull/904). No issue PR or reviewer dispatch was created.

Pushed checkpoints:

- RED `ce7dbe5b4e7515fae7da5979f063bbe37c711ada`, new domain sibling only; production is byte-identical to the supplied base.
- Initial GREEN source `834c36cf38a88a95be8f7d3d74a76dfd25d067b8`.
- Verified implementation `d67a7df63ea66d580fbb8743b95a921a68c70fdb`, tree `cf791997ad6c2014eb9c7109062313e99a56801e`. This additionally makes comparative consumption rerun the same policy as issuance. The final evidence-only commit follows it; use the branch handoff head including this receipt.

The host thread configuration reports provider `codex_work`, model `gpt-6.1-sol`, reasoning `medium`, service tier `default`. Model/effort match the request. The host does not explicitly report the requested Standard label, so Standard is not independently confirmed. No model replacement, configuration change or quota probe occurred. This writer used no children.

## Executed policy evidence

The exact RED/GREEN command was:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts src/modules/diagnostics/domain/PrivateContinuityManualCorrection.spec.ts src/modules/diagnostics/domain/PrivateContinuityVinCorrection.spec.ts
```

RED freshly executed 78 cases: 21 failed and 57 passed. The C2 positive, 18 graph/pin/direction permutations, minimum uncorrected VIN/VIN positive and shortened-rights positive all failed with `DIAGNOSTIC_NO_ACCESS` at the old VIN/VIN refusal. All 52 existing cases passed. This is meaningful policy RED, not hosted HTTP RED. GREEN freshly passes 79/79 with the same command. One supplementary both-visits-corrected rights case was added after the RED checkpoint to strengthen existing rights coverage; it adds no separate production behavior. All existing domain specs remain byte-identical.

The first attempt stopped before execution because ignored workspace outputs were absent. Offline contracts build followed by DB build/generation using the nonconnecting placeholder `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` resolved package imports. `setup-package-resolution.log` preserves the setup failure; it is not criterion RED.

| Criterion | Evidence | Result |
|---|---|---|
| C2 explicit raw04I/EA to raw041/EC correction, immutable pin | New public-interface domain sibling; unchanged existing C2 HTTP body | Domain PASS; hosted HTTP UNKNOWN |
| Complete graph, pin/order permutations, no missing/disconnected/branch/cycle/component | New domain cases, count of all order evidence in adapter | PASS |
| Corrected actual bound raw VIN versus every VIN stamp, including VIN999 despite chassis041/B041 | New domain cases; new ordinary HTTP negative | Domain PASS; hosted negative pending |
| Fresh support/explanation, coherent methods/raw bindings/current observation, no unexplained raw history | New domain cases and existing evidence adapter/DB guarantees | PASS |
| Original/intermediate/leaf/both-visit/provenance rights and shortest end | New domain cases; new original-rights HTTP sibling | Domain PASS; hosted rights boundary pending |
| Automatic refuses corrected data, manual/manual and uncorrected mixed preserved | All existing 52 policy cases plus new automatic and mixed refusal cases | PASS |
| Issuance and consumption use the policy and full bindings | Both call `comparisonRights`; original authority/locking/retry/transaction code inspected | Source PASS; hosted C2 consumption pending |
| Existing base files, modes, 99 E2E files and selected 110 names | Complete blob/mode manifests and actual import-only collection | PASS |

## Policy and adapter

[Private policy](../../../apps/api/src/modules/diagnostics/domain/PrivateContinuityAttestation.ts) extends the existing explicit graph resolver to comparative VIN/VIN. It resolves links from the sole root to the complete terminal record, regardless of array position or immutable pin location. It does not filter historical conflicts away or select an array-last record. Every node retains its original raw identity id/hash and embedded observation. Each VIN node requires VIN support matching its actual bound observation, and every simultaneous current identifier must agree within/across the effective leaves. The comparison DTO and its original observation are unchanged; only the policy's local interpretation uses the justified terminal record.

[Prisma identity evidence](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts) already includes each node's actual `identityRecord.observation` in its schema-validated DTO. Its graph locks raw/evidence/provenance rows, checks retained rights/material and ancestors, and identity comparison returns the entire pinned component including ancestors and descendants. Immutable DB guards enforce same-order exact raw binding and earlier single-successor correction edges. No redundant raw rehashing or alternate observation lookup was added there.

[Proof adapter](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts) passes all retained raw rows with their ids/hashes/observations and current intake observation for VIN/VIN. This extra history accounts for raw records outside the structured chain rather than duplicating embedded leaf lookup. Missing/erased raw bindings, unrepresented raw history and current VIN disagreement refuse. It counts all order evidence so a disconnected component cannot disappear through component selection. Durable evidence bindings now explicitly include each original/correction raw id/hash alongside record and rights hashes; all existing order generations, provenance hashes/epochs/rights, authority/session, assignment and qualification digests remain bound.

Both issuance and consumption now call the same policy and compare the minimum rights end. Final inspection found that the base only reran this policy for automatic consumption, despite earlier prose describing shared consumption. The final checkpoint removes that method condition. Full comparative consumption uses its existing locked comparison and bindings; exact already-consumed retries still return before mutable admission. Lock order, independent current reviewer authority on both orders, current linking technician, one successor, audits/rollback, consumed-link survival, erasure and permanent source invalidation remain intact.

The minimum newly admitted uncorrected VIN/VIN case is explicitly tested: complete retained graphs/raw bindings on both visits with consistent equal trimmed-uppercase VINs and shared physical identity can use the existing independently assigned reviewer. This follows ADR-0108's comparative authority and adds no issuer eligibility. Unrepresented raw recaptures still refuse this bounded comparative path; unchanged automatic raw-recapture behavior remains tested and unchanged. No fuzzy identity normalization, OCR or identifier precedence was introduced.

## Ordinary HTTP siblings, not locally executed

[New refusal sibling](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticVinCorrectionConflict.e2e.spec.ts) adapts the existing manual-conflict fixture and C2's ordinary raw correction endpoint. Both serial cases capture and release immutable A at raw04I/EA, capture independent B041/chassis041, append raw041 on A, then EC explicitly superseding EA with fresh sanitized provenance and explanation. The conflict case binds EC to raw041 but claims VIN999 while retaining chassis041. The rights case keeps EC consistent and advances only after A's original evidence/provenance authorization expires.

Before issuance each case requires full comparison, all three literal exact sanitized downloads with byte lengths and SHA-256, and current independent reviewer/technician Users, Sessions, grants, qualifications and both assignments. Refusal requires uniform403/private-no-store/no-secret, no proof/report/audit residue and unchanged orders/raw/evidence/provenance/release snapshot/PDF rows. It rereads comparison and all three downloads after conflict; expired rights fence comparison and bytes. Cleanup retains request-created reception bindings, collision and descendant preflight, registered objects deleted before rows with HEAD404, and guarded exact parent-order cascades for immutable identities. Only the new raw row whose full request binding was proved is registered; discovered unknown descendants are never adopted.

Existing C2 and all 99 existing E2E files remain byte-for-byte and mode-identical. No assertions, setup gates, cleanup, budgets, timeouts, guards, contracts, schema, reset or CI files were changed.

## Offline verification

Logs, temporary configs, scripts and full manifests are under `/tmp/issue-914-vin-correction/`.

| Gate | Result |
|---|---|
| Exact domain command above | Fresh RED21/78, final GREEN79/79 |
| Configured root `pnpm test:unit` | PASS10/10 tasks; API fresh263 files, 2506 pass/two existing skips; nine tasks cached; `root-unit-final.log` |
| Configured root `pnpm typecheck` | PASS11/11 tasks; API fresh, ten tasks cached; `root-typecheck-final.log` |
| Direct API `tsc --noEmit` and `tsc6 --noEmit` | Both fresh PASS; empty logs |
| Affected ESLint and full API lint | Both fresh PASS, zero warnings |
| API Nest build | Fresh PASS |
| Agent docs / runtime imports / glossary / diff | PASS; glossary31 terms |
| Actual import-only collection | PASS112 declarations; all selected110 names/files retained, new2; empty stderr |
| Base preservation | All4151 base paths compared against actual git blobs/modes; only three permitted existing paths differ; other4148 identical; all99 E2E and all existing domain specs identical |

The first configured root unit run failed five existing AdminApiBridge cases because the checkout lacked admin `next/navigation`. `pnpm --filter @auto-tm/admin exec node -p "require.resolve('next/navigation')"` installed the locked workspace dependency and resolved it. The unchanged configured command then passed, including the final post-consumption-change run. `root-unit.log` and `admin-resolution.log` retain that setup diagnosis. No test exclusion or product/config repair was used. Cached tasks are cache reuse, not fresh execution.

Collection used a temporary config selecting only the ten continuity specs, `globalSetup: []`, `setupFiles: []`, and `vitest list --staticParse=false --json`. Actual imports registered tests, without running hooks, bodies or diagnostic HTTP. The retained110 names/files match both the supplied-base selection and the prior manual writer collection after normalizing checkout prefixes. Counts include the original99, comparative2, automatic1, consumed-erasure1, unchanged C1/C2/P1 one each, existing mixed-conflict2/manual-conflict2, plus new VIN negatives2.

Docs: not applicable. This is internal policy/adapter logic using existing repository interfaces and dependencies. Only the diagnostics overview's affected admission limitation changed; Feature50, flow66 and ADR-0108 remain governing requirements. Parent execution bodies were not edited.

## Next gates and remaining obligations

Root must assemble all checkpoints and obtain hosted real PostgreSQL/private-storage acceptance for unchanged C2, both new negatives, C1, mixed/automatic regression, consumption/invalidation/retry/erasure and retained security coverage. Independent fixed-SHA Standards/Spec review and wider #897 acceptance remain Root's gates. No diagnostics E2E hooks/bodies/HTTP or local Docker/database/Redis/container services were run by this writer.

C2/P1 HTTP remains UNKNOWN. The predecessor9e API was cancelled by the host30-minute limit after codecs took22m20s; workers passed373, with no API verdict. That supplies no genuine reached C2/P1 RED. This source/domain GREEN is not hosted acceptance. See [prior receipt](../issue-897/manual-correction-assembly-and-9e-hosted-receipt-20261022.md).

Corrected mixed journeys, public transfer/current publisher authority and temporary no-proof fallback, broader automatic issuer eligibility and multiple-root eligibility remain explicit future obligations. They are not release exclusions or silent defaults. No new product decision or unresolved authorization was invented for this slice.

No Railway/access/reset/deployment/credential discovery/provider quota probe/CI dispatch/rerun/cancel/poll/external message/integration push/merge/promotion/store/launch occurred. Three prior Railway refusals remain terminal. No host guard refusal occurred in this writer. The checkout remains owned for Root's later lifecycle cleanup after integration; do not retire it before recovery evidence is incorporated.

## Artifact SHA-256

- `red.log`: `ee223936dafa552902485fc40785ee299afafb2ec900e59e3242a8f2abf54d4d`
- `green.log`: `74d7c9c273a23d99fd5014bb83a4c8ddad8be95431607bf38709f5722a9e4098`
- `root-unit-final.log`: `247e2914197c8b46567cd496b26ce1da5efd03a1b4fd49b291bd5017ef0293bb`
- `root-typecheck-final.log`: `9267a0d0652a92cae30a99c6e3e4c846f8a2d918c55e92ecd110d7d09a05d8c1`
- `ts7.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `ts6.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `affected-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `full-api-lint.log`: `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632`
- `api-build.log`: `9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538`
- `agent-docs.log`: `8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20`
- `runtime-imports.log`: `2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97`
- `glossary.log`: `d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621`
- `base-file-preservation.json`: `49e9d02067ca61de96467084da7a7a1be0685238e332f4d3ac2254e79e3fd0e5`
- `existing-e2e-preservation.json`: `7e07ab362a9ea0e600a1e955692b7d92ce88eff5cb903202d89977e852bc438e`
- `collection.json`: `08aae4f32ba573ea7bd420e4a74eada6a4730143a26bad92e82214b315c461e3`
- `collection-counts.json`: `277dc5303416f7bd3a7543ff18000f0d6a8755e6c654964c0e8499c8f0ae5922`
- `collection.config.mts`: `2fbcdd658a7bbf70770930db09cd11d96a204f4eb12bbb4bbd02144c3baa89fe`
- `base-collection.json`: `13848bcf37dbc6d122a9f0cbd849bdeae0b7e4913012e1529c5b46e90eb178c6`
- `preservation.py`: `883513b6ab69de39e3af51745b9d485356d750c4b99e99ca1c4dad6a5a7c191b`
