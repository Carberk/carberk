# Bounded automatic VIN assembly

Chief of Staff assembled #914's bounded private automatic-VIN source into #897's sole integration PR #904. Full release acceptance remains incomplete. No deployment or reset occurred.

## Inspected checkpoint

Writer branch `agent/issue-914-automatic-vin-source-20261022-native`, base `5361851d704c78658b7c9db11900372a73b4b345`, head `47b47646159f5bd4a064d11892611b8a2d097342`, tree `9f2520a359f6fcee7e4b47ed8f3b65c93459d9ee`. Its reservation, RED `2746a1a6`, source `74bf1e93` and final evidence are preserved. Parent inspected the complete source, tests, migration and registration, then incorporated them as `09b0c149`, `1ed0de61` and `04427e89`. Parent source assembly is `04427e89b06c2a3410e80d0683e55572fa1a0cde`, tree `babfc97634adf0b7dd7573819afa55ab0bb31ad1`. Fresh fetched main `9fde309c3da17f2661fe9c266504e6e56a1b97c9` remains included.

The [exact predecessor hosted RED](hosted-receipt-5361851d-20261022.md) authorizes this source slice. The writer's [evidence](../issue-914/automatic-vin-source-green-20261022.md) preserves additional actual contract/domain RED and offline GREEN. Neither establishes this candidate's hosted automatic issuance/read/consumption.

## Resulting behavior and limits

The strict input and restricted output admit `automatic_normalized_vin` through the existing proof owner. Current independent dual-assigned qualified reviewer authority, same nonnull private commissioner, arrived physical visit, retained predecessor, complete provenance union, immutable bindings, locking, invalidation and atomic consumption remain. Automatic policy requires consistent independently retained VIN stamps, equal normalized VIN across both observations and all retained raw history, and one structured evidence root per visit. Additional roots, corrections, changed identity, contradictory chassis/plate evidence or expired rights refuse. A date or mileage change alone does not change vehicle identity. Consumption repeats the automatic predicate and rights bound before committing.

The new forward SQL changes only the effective trigger's method admission, including an explicit null-method refusal. No historical migration, column, data, proof, snapshot or retention period is rewritten. Root verified that removing only the new schema hash, its inventory and migration registration reconstructs the previous schema-profile object exactly. The new retained SQL mirror matches the migration bytes. The Prisma comment supplies a distinct schema fingerprint for that additive inventory.

This remains a bounded implementation. Multiple evidence roots, broader automatic issuer eligibility, mixed methods, justified corrections and public transfers remain open. The temporary public no-proof fallback is still present and must not be treated as final ADR-0108 delivery.

## Preservation and combined offline checks

All changed writer files match the checkpoint bytes exactly at source assembly. These original acceptance files remain identical to `5361851d`:

| File | SHA256 |
| --- | --- |
| `DiagnosticContinuityProofIssuance.e2e.spec.ts`, 99 cases | `661fe7c95570abf057ce537db0b2c7557fc2a8982c77d6605603b90b5f237ada` |
| `DiagnosticAutomaticVinProof.e2e.spec.ts`, one case | `3dded313c56a8507d3af07bfc90d84471c7ed3079cc83df2af8899f17fbdc472` |
| `CampaignFullV3.e2e.spec.ts` | `780303324cd2402cd4af10bfe41cff33a1492990780fc7262727b5bd50693779` |
| `CampaignFullV3Diagnostics.e2e.spec.ts` | `80816c61234aae876b02558024b8573d718ce0efbee62b7355e69c53ed002213` |
| `staging-reserved-fixture.e2e.spec.ts` | `072f4884d5b8999d0f913d6bb89fa9b319ab55d22e1fdaebf21fbecde4f561bf` |
| `staging-clean-reset-redis-interrupted.e2e.spec.ts` | `4e10b91180aba6d0d9c1f530f42bf9cf66b9c372f2b534aad73d95b5c129f520` |

Parent checks on assembled runtime inputs:

- Repository `pnpm test:unit`: PASS, 10/10 Turbo tasks, all cached from identical checked inputs. Writer freshly executed API 2433 pass/two existing skips and the other counts recorded in its receipt; parent cache replay is not another execution.
- Repository `pnpm typecheck`: PASS, 11/11 Turbo tasks, all cached. Both root commands supplied the inert `postgresql://offline:offline@127.0.0.1:1/offline` generation URL. No service connection occurred.
- API, contracts and DB TypeScript 6 and lint: PASS, executed by parent. Schema checks: PASS, 17/17.
- Import-based Vitest collection with `--staticParse=false`, temporary config, no setup/global hooks or services: PASS, exactly 99 comparative plus one automatic case. Initial static parsing returned 40 declarations; it is not counted as runtime collection or acceptance. No test body ran.
- Agent-doc checks: PASS, 8/8. Runtime imports, glossary and diff checks: PASS.
- Full `pnpm test:root`: PASS, 598 total, 597 pass, one existing skip, zero failures. Parent executed the full suite in 256319 ms.

Logs and collection files are `/tmp/carberk-resume-20261021/auto-vin-assembly-*`. The first preservation script used the wrong directory for `CampaignFullV3Diagnostics`; root corrected the path and the complete six-file and checkpoint-byte comparisons passed. This was an inspection-path error, not a product or host-guard failure. Documentation uses the docs-only RED exemption. No new external dependency or service API was introduced; existing configured boundaries were retained.

## Next bounded work and gates

| Priority | Owner and milestone |
| --- | --- |
| Automatic hosted acceptance | Root publishes this verified assembly; T3 watcher supplies exact-head API/DB/image results. Require unchanged positive to complete issuance, restricted read and consumption, plus all 99 comparative cases. |
| Consumed-link worker erasure | Next isolated #914 test writer prepares one fresh HTTP/real-cleanup case from the completed isolation design. Before cleanup, require exact disposable worker DB identity and unfiltered six-table manifest equality. Prove A-specific restricted-material expiry, exact object deletion, B survival, exact retry and own finding write. Guard refusal is missing evidence. |
| Mixed and corrected identity | Next isolated #914 test writer prepares both manual/VIN directions, then explicit supported correction chains. Preserve original A pin/snapshot and all historical values. Root captures reached criterion RED before a corresponding source assignment. |
| Remaining ADR-0108 | Public transfer must prove current B publisher authority, new consent and association; replace the temporary public fallback only with verified proof admission. Complete method-specific HTTP refusal, lifecycle and concurrency coverage. |
| Clean acceptance | Preserve reset-ordering assertions until equivalent replacement acceptance is green on the same candidate. Exact live inventory, intentional seed/reference reconstruction, producer/storage exclusion, object cleanup/reseed/reopen and restoration remain prerequisites. |
| Release | Full green candidate CI, fresh independent fixed-SHA Standards/Spec review and fixes, native/deployed acceptance and staging restoration, then signed Android artifact. |

Do not dispatch a second #914 writer while one owns the issue. The automatic writer is stopped, with its checkout preserved. Both prior erasure writers failed provider quota and returned no checkpoint; no repeated provider-availability retry is running. Root retains the erasure and mixed/corrected design paths in the exact-predecessor receipt.

Three scoped Railway refusals remain terminal. No credential discovery, account-wide bypass, local services/Docker, reset, deployment, merge, promotion, submission or launch is part of this checkpoint. Prelaunch disposability removes no authorization, customer isolation, erasure, retention or worker acceptance. No historical-environment preservation machinery was added. Goal active, PR draft and auto-merge off.
