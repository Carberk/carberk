# Holder IPC and private consumption atomicity assembly

Chief of Staff continuation of #897, sole integration PR #904. Diagnostic baseline and current published integration head is `f31f4e828ad6ff8d80ed35253e791ca005e57dff`, tree `7681abf68c85893591476880242dcfda70fa69ac`. Main `9fde309c3da17f2661fe9c266504e6e56a1b97c9` remains included. This receipt records a newer parent-branch assembly, not hosted verification of its changed code. Its integration publication is deferred until the existing 91-case hosted run finishes, avoiding cancellation of useful first-execution evidence.

## Inspected checkpoints

- Holder writer base `0169758a`, branch `agent/issue-901-holder-final-ipc-20261021-r1`, RED `775b65b04c441dc71923baf1b1aa67c18794216c`, GREEN `de230305d85a2079e01ba72abda2b60c6cfebaaf`, tree `410d9c68e8f5837246126b366bd9381ba65609e6`. Incorporated as `b2433f99` and `6bf6821a`. Parent inspected the complete helper/test diff and [writer evidence](../issue-901/holder-final-ipc-20261021.md).
- Atomicity writer base `f31f4e82`, branch `agent/issue-914-consumption-atomicity-20261022-3f7bf0ac`, checkpoint `5b3b90b983630f4471898e591e07a01f80b13e64`, tree `b7f91655a23c0f4e1015a1178318734ed822895b`. Incorporated as `f793bbdd`. Parent inspected all 126 added spec lines, reused helpers, actual consumption/retry source, report invalidation trigger and existing contention/fault patterns. [Writer evidence](../issue-914/consumption-atomicity-test-slice-20261022.md).

The helper waits for its terminal IPC send before forced exit and treats failed delivery as failure. Its real child-process regression replaces only the external PostgreSQL boundary. Backpressure previously lost completion while exiting successfully; the repaired helper delivers completion. Missing termination, wrong error, missing end and disconnected IPC remain nonzero failures. This is attempt 1 for terminal delivery, separate from the attributed health-probe race. Synthetic pressure does not establish the exact hosted pressure cause.

The five new private consumption cases cover identical requests, competing report ids, two unused proofs and both exact audit INSERT faults. They observe actual blocked backends before releasing sorted order locks. Fault sequence receipts require the consumed marker and new report to be visible inside the failing audit transaction, then require complete rollback, sanitized output, exact cleanup and successful ordinary retry. They fabricate no proof, report or identity pin.

## Preservation and combined offline verification

Removing only the atomicity append reconstructs all 75,366 baseline spec bytes, SHA256 `2ce6f262ebe23c6c63fe3ecf32bd606fad297aacdd8a83ea2ea3b19c2444c6fa`. No original helper, hook or 91-case body changes. Parent confirms the incorporated helper and test exactly match the writer checkpoint:

| File | SHA256 |
| --- | --- |
| scripts/testing/campaign-transaction-holder.cjs | `392fa64fe168e265ea15659d91a3817c66931dba9caf9b2448f640679a74eea9` |
| scripts/campaign-transaction-holder.test.mjs | `a255f7657c5779e0621b005c783facf992a85650e03395ff1c12b40bbe7d2d58` |
| packages/db/scripts/staging-reserved-fixture.e2e.spec.ts, unchanged | `072f4884d5b8999d0f913d6bb89fa9b319ab55d22e1fdaebf21fbecde4f561bf` |

Combined changes contain only the helper, its process test, an appended proof-spec block and evidence documents. CampaignFullV3, CampaignFullV3Diagnostics, reserved-fixture caller, production reset, guards, schema, contracts, CI, retries and budgets remain unchanged.

- `pnpm test:root`: PASS, 597 tests, 596 pass, one existing skip, zero failures. This ran on the incorporated helper before the test-only API append, which changes none of this gate's inputs. New helper tests are included. Log `/tmp/carberk-resume-20261021/holder-assembly-root-20261022.log`.
- Expanded proof collection with a temporary config and no setup/global hooks: PASS, 96 cases. Collection is not runtime acceptance. Logs `assembly-collection-96.json` and `.err` in the same directory.
- `pnpm test:unit`: PASS, 10/10 tasks, all cached from identical checked inputs. `pnpm typecheck`: PASS, 11/11 tasks, all cached. The isolated atomicity writer freshly executed API units, 2425 pass and two existing skips; the parent's cached result is not another execution.
- API `tsc6 --noEmit` and lint: PASS. `pnpm test:agent-docs`: PASS, 8/8. Runtime imports, glossary and diff checks: PASS. Logs `/tmp/carberk-resume-20261021/helper-atomicity-*.log`.
- Docs: not applicable to internal helper shutdown and existing acceptance patterns; no external dependency or API change.

## Published-baseline DB result

Exact `f31f4e82` PR Checks run `39703875881`, DB job `119579283812`, completed SUCCESS: 41/41 files and 391/391 cases. Reserved-fixture suite 14/14 and interrupted-Redis suite 6/6 pass, including marker-loss and persisted-marker restart cases. Raw log `/tmp/carberk-resume-20261021/f31f4e82-db-119579283812.raw.log`, SHA256 `c5e40f5c1b8edbae77a57b882af4c7dcc096fd03116b5a7d0dff19fd3f23b77d`.

This result predates both assembled additions. It does not establish the helper repair's hosted result or eliminate an intermittent health-probe race. The local gh CLI rejected an unsupported escape-sequence flag; its ordinary log command succeeded, and only sanitized relevant extracts were inspected. API/91-case authority and remaining exact-run results are still awaiting terminal classification; no overall GREEN is claimed.

## Continuing work and exclusions

Two Muse design tasks were stopped after their activity showed `exceeded retry limit, last status: 429 Too Many Requests` before any commands, despite a running task status. Their prepared checkouts are preserved. A GPT 6.1 medium read-only replacement produced `/tmp/issue-914-automatic-vin-next-red-design-20261022.md`; it is design, not implementation or final review.

At the first parent checkpoint, bounded writers were preparing a maintenance-database health-probe correction with genuine target/maintenance controls, and a separate automatic-VIN HTTP test-only checkpoint. Automatic proof tests retain the existing distinct, qualified, dual-assigned reviewer subset. No technician/self/background issuance permission is introduced. Eligibility beyond that subset remains unresolved; the approved vehicle/audience/transfer policy is unchanged. Private consumed-link rights expiry and surviving-B lifecycle still need runtime coverage; `/tmp/carberk-resume-20261021/private-consumption-lifecycle-next-20261022.md` records the clock and worker-isolation constraints.

Prelaunch reset authorization remains subject to exact live inventory, reproducible intentional reference edits, preserved configuration/credentials/signing/infrastructure and enforceable producer/storage quiescence. No reset, local service, Docker, Railway access retry, deployment, merge, promotion or store submission occurred. Full green CI, remaining ADR-0108/reset scope, independent fixed-SHA Standards/Spec review, native/deployed acceptance/restoration and signed release artifact remain open.

## Maintenance-probe follow-up

Root inspected the complete [maintenance-probe checkpoint](../issue-901/maintenance-health-probe-20261022.md) `f8341bfaa08ab28da065ce0d015f41027998e16a`, tree `4b9fa779e2f8db5cf3ab8422aea09bbf1b9edbf2`, branch `agent/issue-901-maintenance-health-probe`, base `6bf6821a`. Two files change, +92/-1. Incorporated as `7df8b32b` after the first parent receipt `23bcd2fb`. The health-check override copies the installed defaults and changes only its database argument to the maintenance database. Health and port startup, ordinary target URI/migration readiness, credentials, interval, timeout and retries remain. The existing target-backend refusal control is unchanged; a new held maintenance-backend case requires actual target inventory/deletion and unchanged Redis state.

Parent AST verification confirms all six original interrupted test expressions remain identical, joined SHA256 `cca5d3be05dd16c0529fda8910077700218a1fc87595f22490c689c1caa9733f`. The added case is a seventh declaration. Parent offline checks PASS: 13 collected cases across the interrupted and existing target-refusal suites with no setup/global hooks; DB TypeScript7 and TypeScript6; DB lint; transport7/7; related root contracts36/36; docs and diff. These run no services and establish no PostgreSQL acceptance. Official versioned API/pg_isready documentation and installed type verification are recorded in the writer receipt.

All original restart/marker/replay assertions, the new maintenance control, target-refusal/no-mutation and full DB gate remain required on the next hosted candidate. Earlier PID467 remains unattributed. The first attributed-probe fixture correction is not another guard repair. The automatic-VIN HTTP test writer remains active; the maintenance writer is terminal with no pending runs. Published integration stays f31 while its existing runtime run completes.
