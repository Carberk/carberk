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
