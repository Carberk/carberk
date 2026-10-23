# Manual correction assembly and cancelled hosted run

Root inspected and acknowledged the completed #914 supported manual-correction task. Writer RED `e86799a0116bbfa9ba992069465c1eecb0361cce` and GREEN `abe9dd72db0bcbcbce7cb80dfb7a1d86e9cc6204` were assembled in order as `0903872f` and `5e8872f80f290640256f6a4eeeb4d5883191c3da`. Root's source tree is `cce4f1e67286e4b2df70eec3f44110ccb0a6215d`; it differs from the writer only by the previously committed [staff UI gap](diagnostic-staff-proof-ui-gap-20261022.md). There are no active writers or pending task questions at this checkpoint.

The [writer receipt](../issue-914/supported-manual-correction-source-20261022.md) preserves genuine domain RED 23/29 followed by the same command GREEN 52/52. Root inspected the complete domain/adapter diff, new domain spec, and the new HTTP sibling against the previously inspected mixed-conflict fixture. Explicit supersedes links resolve a complete manual/manual correction chain independently of array order and pin position. Original pins, all retained records, full-chain rights and provenance/generation bindings remain. Branching, disconnected evidence, inconsistent current claims and unsupported correction explanations refuse. Issuance and consumption use the same policy. VIN correction, comparative VIN/VIN and public transfer remain unfinished.

The two added HTTP negatives establish raw identity, released A, full comparison, three exact sanitized provenance downloads and current independent authority before issuance. A conflicting corrected leaf and expired original evidence/provenance rights must refuse without proof/report/audit residue. Cleanup retains exact request-owned descendants and object-first deletion. Existing 98 E2E files and the original domain spec remain byte-identical; all 4,143 other existing base paths are unchanged. The RED checkpoint changes no production source.

## Root local verification

All commands completed with exit0 on assembled 5e8872f8. Logs/manifests are under `/tmp/carberk-resume-20261021/c1-*`.

| Gate | Result |
|---|---|
| `pnpm test:unit` | PASS 10/10, all cached; cache replay is not fresh execution. |
| `pnpm typecheck` | PASS 11/11, all cached. |
| Direct API `tsc --noEmit` and `tsc6 --noEmit` | Fresh PASS for TypeScript 7 and 6. |
| Full API lint | Fresh PASS, zero warnings. |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts src/modules/diagnostics/domain/PrivateContinuityManualCorrection.spec.ts` | Fresh PASS 52/52. |
| Agent docs, runtime imports and glossary | PASS; glossary 31 terms. |
| Base preservation, controlled writer-tree difference, RED source preservation, diff whitespace | PASS. |

The writer separately freshly executed API units 2478 pass/two existing skips, API build and full lint. Neither local unit nor import collection establishes hosted diagnostic HTTP acceptance. Docs: no external dependency/interface changed; no new lookup was needed.

## Exact 9e hosted result

Published predecessor `9e99280b632f1740512ea1093f18dc24533f4278` has terminal [run 39839778374](https://github.com/Carberk/carberk/actions/runs/39839778374), conclusion CANCELLED. [API 120037542080](https://github.com/Carberk/carberk/actions/runs/39839778374/job/120037542080) has the host annotation: **“The job has exceeded the maximum execution time of 30m0s”**. This is a job-budget cancellation, not an observed API assertion failure. No cancellation was requested by Root or the writer.

Pinned codec installation took 22m20s, from 19:25:07Z to 19:47:27Z. Disposable services, locked installation, generation, migrations and bucket creation then passed. `pnpm test:api` began 19:47:55Z; worker 57 files/373 tests passed. No API test verdict appears before cancellation at 19:54:59Z. C2/P1, repaired consumed-worker/cleanup, Improvement and retained reset-tail outcomes on 9e remain UNKNOWN. The prior c4 runtime failures remain historical evidence at their original SHA. Runtime/lane/static/DB/frontend passed on 9e; docs skipped under unchanged policy; aggregate PR failed because API was cancelled. No timeout, CI policy or codec requirement was changed.

Downloaded API log SHA256: `8bdf95d047a4554fdb9c069678611cfaf8afd140320c8e2671d0666be975da49`. Raw/ANSI-stripped logs, run/job/check metadata and annotations are retained under `/tmp/carberk-resume-20261021/9e-*`.

## Next gates

The prior run is terminal, so the verified mixed/manual source candidate may now be published through sole draft PR #904 without replacing live evidence. Obtain hosted positive and refusal coverage. Continue supported VIN correction, public transfer/publisher authority and the missing staff capture/comparison/proof workflow. Full independent fixed-SHA review, native/browser/deployed/operations acceptance, latest-main restoration and signed Android artifact remain required. Store submission and launch are separate decisions.

Prelaunch reset authorization remains conditional on inventory, reproducible intentional reference edits, configuration/credential/signing/infrastructure preservation and enforceable worker/storage exclusion. Three scoped Railway refusals remain terminal. No reset, Railway retry, local service start, deployment, merge, promotion, store action or release acceptance occurred.
