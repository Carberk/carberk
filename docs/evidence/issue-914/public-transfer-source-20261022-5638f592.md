# Public transfer source checkpoint, 2026-10-22

Bounded Codex implementer for selected #897/#914. Root remains sole assembler through PR904. This checkpoint implements comparative public pair issuance/consumption and current B publisher admission/publication checks. It does not establish full public-transfer completion or hosted acceptance.

## Ownership and checkpoints

- Supplied base and reservation: `3fe5b573851f1f5254c97aa178b05623b9f5b2f1`, tree `7a0f69a144f7bb74cad1d85baa7873f745f569a7`.
- Host isolation: `/Users/bagtyyar/.t3/worktrees/carberk/t3-5638f592`. Host status reported attached, distinct from Root's checkout. Preserved scaffold `t3/5638f592` remains at the supplied base.
- Unique pushed issue branch: `agent/issue-914-public-transfer-source-20261022-5638f592`. Reservation was pushed before edits. No integration/main push, issue PR or nested agent.
- Fresh RED: `5e98a722`. The full checkpoint SHAs/trees and final artifact inventory are recorded below after verification.
- Both original preparation reports were read in full. Their lock-order, nonacting participant, permanent invalidation, historical A and outstanding race objections informed this source. Their earlier NOT DISPATCHED statements were treated as historical. The [Root base receipt](../issue-897/corrected-mixed-assembly-20261022.md) and accepted ADR0108 remain authoritative.

## Source contract

The publisher participant is B's existing intake `commissionerId`. Intake checks that initiating User's personal seller or active business membership authority; assigned reception separately records publication consent. The new Identity-owned `PublisherBindingPort`, exported through `identity.public.ts`, evaluates that nonacting participant without a Session. Acting reviewer and technician still use their real Sessions and independent diagnostic grants, qualifications and assignments. Membership grants no diagnostic staff capability. Active business membership is checked directly; history-capable `BusinessAuthority.resolve` is not used as current publishing authority.

Discovery selects lock targets without granting authority. The diagnostic owner discovers both orders, their public commissioners, Listing sellers and Listing businesses, combines these with all acting staff and the linking technician, then Identity locks that whole sorted User union. Identity discovers each locked User's membership and acquires the sorted Business union, including businesses that personal-context acting resolution may lock. Listings, orders, reports and proofs follow. Discovery pointers are re-read after feature locks; a changed set refuses without restart, timeout or retry changes. Subsequent comparative and staff bind calls reacquire already-held Users; they do not supply separate subset ordering. Finalize prepares the actor/publisher union before report load. Reobservation also acquires Listing before order. The source exposes no restore transition: the transition schema has submit/return/finalize/withdraw and the report model permits review only from submitted. No new restore power was added.

Each public proof durably binds actual transaction-derived A/B audiences, distinct commissioners, current Listing identities and ownership, consent, association, current B publisher membership/User/business digest, existing raw/report/evidence/provenance/right generations, staff digests and immutable report/raw pins. Listing and publisher bindings have strict internal schemas. No input hash authorizes these facts. Public proof reads retain the existing restricted strict DTO; the additional authority and Listing facts reside in immutable durable `bindings`, with direct DB assertions in the new cases.

A's snapshot, report/raw/structured pins and historical commissioner remain history. Its current order version/epoch/generation and current Listing identity/ownership/status are unused-proof bindings. A need not be publicly available or have an eligible current historical publisher. A may already be withdrawn. Changing a bound A fact after issuance invalidates that unused proof; issuing after an allowed historical change binds the new current source without rewriting the old snapshot. B independently needs fresh physical authorization, publication consent and a current validated active Listing association. Neither commissioner nor consent transfers from A.

Forward SQL adds public pair admission, checks actual current B publisher state and exact Listing/consent/association fields, removes the no-proof public report INSERT fallback and permanently invalidates unused proofs on relevant Listing, publisher User, Business and membership transitions. A membership digest is repeatable; transition invalidation provides permanence without a historical ledger. The SAME-proof membership revoke/restore test restores the entire original membership row and still requires refusal. Consumed proofs are excluded from invalidation. Ordinary B writes and exact retries do not rerun A admission. Finalize independently checks B's current publisher; anonymous reads retain their existing gates without requiring the original employee's ongoing membership.

A deferred public-proof constraint requires its issuance audit and, when consumed, the linked report and both consumption/creation audits in the final transaction. Public issuance audit ID equals proof ID; public consumption audit ID equals report ID. Audit details retain their existing minimal content. Private audit IDs and private binding shape are unchanged. Existing uniqueness and immutable pin guards remain. No migration backfill, schema column, dependency/version, operational activation, CI or budget change was added.

## Test preservation and new frontier

The original P1 reached-RED setup and issuance assertion are preserved. Historical exactc1fa run39848453485/API120068048893 reached 403 instead of 201 only after full setup, comparison and byte downloads; raw SHA256 remains `03fe8ea3e83ca637ddccb847b04b0029d10cba45f1942efa55e2a531be4b54c2`. This writer did not rerun or reclassify that hosted evidence.

Inspection found one later P1 fixture error: a Note with no report evidence conflicts with the existing required-evidence domain rule. Its assessment is now Normal, retaining the independent B finding and all original assertions. No evidence requirement was relaxed. A byte comparison proves that this is the sole change inside the original P1 test body; new tests follow it. Its original full assertion frontier remains, including restricted reads, issue/consume audits, empty B draft, no material/PDF copying, retries/conflicts, independent B release/withdrawal, A history and no resurrected badge.

Five fresh public HTTP cases reuse that suite's ordinary setup helpers. They assert actual public bindings, direct HTTP/SQL missing-proof refusal, rollback of consumed-proof-only and proof/report-without-audits transactions, SAME-proof personal and membership revoke/restore, B publisher loss before publication with authorized draft survival, and retained withdrawn A with an inactive historical seller. They are imported but not executed locally.

Only the corresponding legacy `DiagnosticReports.e2e.spec.ts` fixtures are converted to classified own-visit capture and reviewer-issued proofs. All original snapshot, own observation/template, no-copy/evidence isolation, disclosure, withdrawal, exact retry and real PostgreSQL successor-race assertions remain. New consumption-audit assertions accompany their creation-audit checks. A consumed proof's changed report/version now conflicts through the proof contract; a proof for a different target visit receives protected refusal. Registered identity keys use DELETE plus HEAD verification; unknown identity descendants refuse cleanup. Protected reset test/source bodies are untouched. The schema-profile change adds exactly the five new migration triggers.

## Verification

Artifacts live in `/tmp/issue-914-public-source-5638f592/`. Commands use the repository configuration and an explicit offline dummy `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` where needed. No local service, Docker, hosted reset/deployment/native session, Railway retry, CI dispatch or quota query occurred. Offline DDL validation uses the already-installed transitive PGlite engine in memory and opens no listener; it is not hosted PostgreSQL evidence.

| Check | Result |
| --- | --- |
| Fresh domain/authority RED command | 3 FAIL / 16 PASS. Public comparative pair, eligible personal publisher and eligible business publisher failed on refusing scaffolds. These modules are used by the production adapters in GREEN. |
| Same two domain files after implementation | 19/19 PASS |
| Existing five private continuity specs plus new pair and publisher specs | Fresh 124/124 PASS across seven files, including original corrected-mixed20 and graph6 |
| Repository `pnpm test:unit` | PASS 10/10 tasks, 9 cached and 1 executed |
| Repository `pnpm typecheck` | PASS 11/11 tasks, 10 cached and 1 executed |
| API `tsc --noEmit`, `tsc6 --noEmit`, `lint`, Nest `build` | Each fresh PASS |
| DB/contracts builds, DB/contract TS6 and lint, Prisma validate | PASS, exact log hashes in artifact inventory |
| Offline full migration application | All 68 migrations applied, including all four new public functions and five new triggers |
| Offline exact schema/reset profile check | `node --test scripts/staging-clean-reset.test.mjs`: 20/20 PASS |
| Actual proof-suite declaration imports | `vitest list --staticParse=false --json`, global/setup hooks disabled: original116 retained plus five new =121; no bodies executed |
| Legacy report declarations | Actual import-only collection: 15 declarations, all original test names retained |
| Agent docs/runtime/glossary/whitespace | Each PASS |

Initial DB build overlapped the first contracts build and lacked the contracts entry; after building contracts first, DB build passed. Initial test invocation failed at package import, not a criterion RED. The initial repository gates exposed missing declared frontend dependencies. Frozen-lockfile repair first encountered a partial modules-directory removal error; prior generated modules were preserved under the artifact directory and a normal frozen install into the owned worktree with a `/tmp` store succeeded. One collection attempted during that failed install also failed to import; only the later successful collection supplies retention evidence. No package/lockfile/version change was made. Initial lint found duplicate imports and non-null assertions, which were corrected. All failed logs remain distinct from successful verification.

Docs: not applicable to an external integration change. This uses existing repository authorities, installed types and SQL/transaction conventions; no dependency or service API was added or upgraded. The database-migrations skill's forward-only rules were applied.

## Criterion frontier and remaining mandatory work

| Criterion | Local evidence | Hosted/current status |
| --- | --- | --- |
| Distinct personal sellers/different Listing P1 issuance/consumption | Pair domain GREEN; source/forward SQL; original P1 retained | Full HTTP frontier UNKNOWN, Root must execute |
| Current nonacting B publisher, no fake Session or staff grant | Identity domain GREEN; port/adapter/composition inspected | Public HTTP personal/business authority UNKNOWN |
| Complete User union before Business/features and changed-discovery refusal | Source call/lock inspection, no extra retries | Real locked publisher/Listing/member/business races UNKNOWN and still mandatory |
| Immutable transaction-derived public bindings and original identity/material generations | Source plus new durable DB assertions | New assertion bodies UNKNOWN |
| Unused-proof permanence including identical membership restore | Forward transition triggers; SAME-proof personal/member cases written | Bodies UNKNOWN; complete Listing/business/User mutation/restore matrix remains |
| Required proof in application/SQL; atomic issue/consume/report/audits | Forward guards/deferred constraint; direct negative SQL cases written; offline DDL PASS | SQL behavioral and rollback bodies UNKNOWN |
| Own B draft, no copied findings/evidence/PDF or authority transfer | Original P1 and substantive legacy assertions retained | Public runtime UNKNOWN |
| Exact retry, conflict and successor/proof/first-report uniqueness | Existing constraints and legacy real races retained, proof-aware audit checks added | Public concurrency bodies UNKNOWN |
| Current B publisher loss after consumption before release | New personal publisher case preserves ordinary writes and consumed proof | Body UNKNOWN; business/member release-loss matrix remains |
| Retained withdrawn A, historical publisher not B authority, later A changes do not block B | New withdrawn/inactive-A and surviving-B cases written | Bodies UNKNOWN; erased A/different-commissioner B matrix remains |
| Same business/different employee | New distinct-employee business proof and SAME-proof membership transition case | Runtime UNKNOWN; same-Listing journey still mandatory |
| Changed Listing ID, identity, seller; stale/wrong/missing/automatic proof cases | P1 distinct IDs, domain mixed/private refusal and automatic-public refusal; missing-proof tests | Complete public negative/mutation matrix remains mandatory; unchanged public automatic admission is not delivered by this comparative slice |
| Raw/evidence rights, retained roots, expiry/erasure and restricted/minimum disclosure | Existing five domain files and all unrelated HTTP files retained | Full public rights/retained-root/erasure matrix remains mandatory |
| Staff foundation, same-visit manual/VIN correction and Play metadata | Untouched | Independent founder questions remain pending |

No release exclusion is inferred for an outstanding row. Root must inspect/assemble the returned commits before publishing or assigning another slice, then run hosted HTTP/DB acceptance and independent Standards/Spec review. This checkpoint is not a merge, promotion or launch approval.

Preservation inventory: all 4,168 base paths retained with no mode changes; 4,155 byte-identical, 13 changed. Of 101 existing repository E2E files, 99 are byte-identical; only public P1 and the corresponding legacy public report fixture file changed. All six original private continuity domain source/spec files and all eight protected reset source/test files are byte-identical. New original20 corrected-mixed and graph6 tests remain unchanged. The actual declaration comparison retains116 plus5, and legacy report collection retains every original name. The exact legacy assertion-line changes are listed in `legacy-assertion-preservation.json`; substantive snapshot, own-observation, no-copy, uniqueness and disclosure assertions remain.

## Pushed source and exact artifact hashes

RED `5e98a7225bc5e879c5c312c11a8dbaa0c8b9d2c2`, tree `64bc19f5ca41f15a9484595cebd61314fe78f1e3`. Source `c875c72dc0c5e7c7a68f87a8d9d2e03d84421510`, tree `f049bdba708513aab37a155ece39c1d07b46170d`. The final receipt-only commit follows this source with no implementation change. `commands.json` maps executed command logs to exact invocations. Final source is preserved as `source.diff`.

| Artifact | SHA256 |
| --- | --- |
| `agent-docs.log` | `8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20` |
| `base-manifest.txt` | `f6cebb09d8d85f3ea841c63aea4e9e02656d8f2289aab9d0a57de0ca14519a94` |
| `build-final.log` | `9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538` |
| `build-verified.log` | `9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538` |
| `collection.config.mts` | `37a8bf7b39620274908bf5f8acaf4aa8853f8da1ec2d0d7d6137e7113b38b4f4` |
| `collection.json` | `3da186e8ba83f63276906fa800467b6b50a3f5a87d9c48b8b1698fd725ea35c2` |
| `collection.stderr` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `commands.json` | `716ffaa291d72a862af6df613641ff5cde535b14dbb220e6c18b213cac2200d0` |
| `contracts-build-final.log` | `b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616` |
| `contracts-build.log` | `b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616` |
| `contracts-lint.log` | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `contracts-ts6.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `db-build-final.log` | `e8a263dec96367b13c066619babcd374728c11e5df1d4f12ed11188072a04b00` |
| `db-build.log` | `7af71623d4177ce17c8cc8c4ffee0a87d96d18c0f1ec9a61970f55b161daa5de` |
| `db-lint.log` | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `db-ts6.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `declaration-comparison.json` | `2c4f0cd64dcccec715fd53ceaed8f4a5541ea01d4d83cf78c2253b1464de7f56` |
| `domain-final.log` | `53323c024b4e5850ba7f3f6bbddf3fab956c424f516e267683b4ed46b8dafc8c` |
| `domain-green.log` | `a58c703b573385f793451cd7ba9a8bdf783dd8ccc8b3bfb6693a6cfc3b4a63ea` |
| `domain-red.log` | `352cda0c132e762fbb80d620423488c875e61840d200f5afbe3ede5771df9c1d` |
| `glossary.log` | `d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621` |
| `install-repair.log` | `cb76052abe05ec403641471ee5ccc7113dc5c73df25798d1aeacdbd0920954c0` |
| `install.log` | `56b8b8eaf7dc2b3449838c17591c551e5578e80b2fbd6ff73c1dd8f63c23873a` |
| `legacy-assertion-preservation.json` | `2efd0b6b6b318bdd3df10ac0c932627a28063486d4ab354274aeabf87a852e44` |
| `legacy-collection.config.mts` | `44ccdd01c9e41f1b75310507c57ea91bd5e09338687a63d2d15118b5d8cc02c5` |
| `legacy-collection.json` | `9f4e995d81d6dfa0c8b7f0ad5f19a0337f219879430e3cc5b19929fe5c3f534c` |
| `legacy-collection.stderr` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `lint-final.log` | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `lint-initial.log` | `8ced42c0ee1ea5721d625c8c4ce4e31e8e302f5ae51f15ba6354119eb0c082cb` |
| `lint-second.log` | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `lint-verified.log` | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `migration-offline.log` | `6501bc3f5faa413b3b3c47f165475ee17a9bc56af1bae781796e9aaeada022b4` |
| `migration-offline.mjs` | `ead1bc0a2bce0d0d467676a05e96f7c691b4851813bff1ba7f6305f7cbd4e7a7` |
| `p1-preservation.json` | `3f5693d0c7d6b3b4aa2d1d57a5c90420872eebb3a93d573d6ed7d82df84e38fa` |
| `preservation.json` | `412bc2c03700bdebbfd0fff9e2a6c5baf11fb6c5b1bb0c575a2b9cd35fcc92ae` |
| `preservation.log` | `1d719e3d5b7718fdbfdded296e239fa620cc2f10089484315640089f310a6464` |
| `preserve.py` | `406856516283964a3b7c17f7a3a216fc1f9b6b8432e8e163f160691f8366a627` |
| `prisma-validate.log` | `e1344514cb0e93026a245afd134e0c874287a64f7c5798cbda02eff700d2aa22` |
| `runtime.log` | `2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97` |
| `schema-profile.log` | `724761c36868e763aa6b3348d96f1c5a45b484ab2f397ff4611577971e0a43ca` |
| `source.diff` | `2acba502292e2b5306e8610d1dfe76adde9265aab65533839bf18ecf47de8362` |
| `ts6-final.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ts6-verified.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ts7-final.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ts7-fourth.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ts7-initial.log` | `84f90bc755227e82575fc0ed59a03c998775a86a174e74dc701c368535a5661f` |
| `ts7-second.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ts7-third.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ts7-verified.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `typecheck-final.log` | `5478cd1269624791af7df9d7a0fd1e462a8cc8bbca83654c8a3aba37976e9530` |
| `typecheck-verified.log` | `06c0fb3b98a9f538d1b5b504901203017dd20a5dbcccf178c05badf321b18ac9` |
| `typecheck.log` | `4c4e97314b10d27ee662d6bbfb492140795bc76a0ca55951396884bdad088a72` |
| `unit-final.log` | `1eb45475cc2a25fa76430e46ea9b0a8bedf29709db1dae30996008b561c699bd` |
| `unit-verified.log` | `440371a4a867d6f9d4049f6075a9d984a9598451ab99e4f891d7e22a7f40ec34` |
| `unit.log` | `18f7c61bb304ba4a442b93212eafdbabe823e025f4db88ada4c84d8622c45b1a` |

The full artifact inventory is `artifact-hashes.json`, SHA256 `15c93f4148f1dc6873e70387cabb31099b954371375d1c7ca4b05b4827428b31`. Artifact paths are local to this host. No interrupted verification process remains; install/generated artifacts are confined to this worktree or `/tmp`. Root owns hosted GREEN, assembly and remaining slices.
