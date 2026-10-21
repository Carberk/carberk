# Prelaunch clean-acceptance contract, 2026-10-21

Acceptance-contract checkpoint for #901 under #897, sole integration PR #904. Base `a43ee64ebf695f9ebf661d9b28604b8cebcaca3e`, tree `3df55a48bd934d9d70159d31acba661e487cee8e`. Documentation only: no source, test, schema, CI, staging, production, credential or GitHub execution change. **No reset, deletion, deployment or live read was performed. Nothing here is a pass.**

Authority: the founder's prelaunch data decision and revised plan in [#897 comment 6314266361](https://github.com/Carberk/carberk/issues/897#issuecomment-6314266361). All existing staging and production application data is disposable test data until public launch. That authority replaces historical-environment preservation. It does **not** replace the selected #897 scope, the existing marketplace, security criteria, ordinary authentication or any product lifecycle, concurrency or erasure requirement. Accepted ADRs are not edited (ADR-0020). This note grants no new security power. It specifies what a later reviewed operator change must do and prove.

Current exact-head facts (run [39586347653](https://github.com/Carberk/carberk/actions/runs/39586347653)): API 3061/3064, worker 364/364, CampaignFullV3Diagnostics 1/1, DiagnosticReports 15/15. The only failures are `CampaignFullV3.e2e.spec.ts:2299` (Support barrier not observed) and both `:3288` media cases (`PUT must still be suspended after exact reset, not timed out`). Raw CLI log SHA-256 `793b7c43b010f8b802d93315a362f17afc4ea5c5337b9d5217ec33c5ef595702`. They remain **RED** until the replacement below is assembled and proved. They are not skipped, no timeout is raised and no assertion is weakened here.

## 1. Non-inference rules

1. Wiping an environment never proves account deletion, retention, private-object cleanup, audit retention or lawful erasure. Those stay direct product tests using ordinary product operations with workers running.
2. A retired preservation assertion is removed only after its replacement proof is green on the same assembled candidate. Until then it stays in the suite and its failure stays RED.
3. A concurrency or security assertion embedded in a v3 case is retained as a product test, even when the surrounding case is retired. Quiescence makes operator races impossible by procedure. It does not remove product races between users, HTTP transactions and workers.
4. Cross-account and cross-business negative fixtures are created inside the clean environment through product routes. "Foreign reservation" preservation is retired; tenant isolation is not.
5. An operator receipt shows what the operator did to inventoried state. It is not product behavior evidence.

## 2. Old assertion → disposition → replacement proof

Key: **P** retained product invariant; **R** retired environment-preservation requirement; **Proof** is the replacement (existing test file:line, new product test **NP-n**, new operator test **OT-x** from §3.9, or deployed matrix row). Line numbers are at the base SHA. Status: *covered* means an existing hosted test asserts the invariant; *confirm* means the implementer must verify the exact boundary before retiring; *gap* means a new test is required first.

### CampaignFullV3.e2e.spec.ts (34 cases)

| # | Case (line) | P retained | R retired | Proof | Status |
|---|---|---|---|---|---|
| 1 | v3 profile, fixed roster, bounded bootstrap without authentication (355) | Bootstrap creates only exact verified active Users and the two coordinator grants with atomic system audits. It mints no Session, token, TOTP or elevation. | Reservation-derived IDs, `cf_` schema, journal and 128/2048 caps | `StaffAuthority.e2e.spec.ts:142`; OT-SEED | covered + gap (OT) |
| 2 | Absent enablement and unknown versions refused before SQL (375) | Destructive operator paths are default closed. | v3 profile flag | OT-GUARD | gap (OT) |
| 3 | Main joined journey: sign-in, distinct staff elevation, admission, redemption, settings, exact disposal with lost-response retry (382) | Ordinary OTP, TOTP, grants, admission, redemption and settings, in one joined journey | Exact disposal and its lost-response retry | `BusinessMembership.e2e.spec.ts:56,69,90`; `StaffAuthority.e2e.spec.ts:56`; deployed S1+B1–B2 joined; OT-RETRY | covered; deployed open |
| 4 | Foreign alias collision refused atomically (454) | Bootstrap never adopts an existing User or destination. | Foreign-reservation identity preservation | `StaffAuthority.e2e.spec.ts:142`; OT-SEED refuses unexpected pre-existing rows | covered + gap (OT) |
| 5 | Another reservation and foreign queue content preserved; late enqueue and mock delivery blocked (466) | Delivery stays on safe test transports. Unrelated Redis namespaces and buckets outside the inventory are never touched. | Cross-reservation queue preservation | OT-INV (foreign prefix survives); OT-QUIESCE; OT-RESTART (no late delivery) | gap (OT) |
| 6 | Row/event budget overflow rolls back with room for cleanup (500) | None | Caps are preservation machinery | None. Caps stay while the v3 path exists. | retire |
| 7 | Cleaning ownership kept after an active exact delivery, then same reset resumes (518) | Destructive work refuses while any job is active, and resumes only the same recorded operation. | Per-reservation cleaning fence | OT-QUIESCE; OT-RETRY | gap (OT) |
| 8 | Changed candidate refused without altering ownership or sessions (552) | Operations bind to the reserved candidate and exact deployments. | Ownership/session preservation | `pnpm test:staging-control` candidate binding; OT-GUARD | confirm + gap (OT) |
| 9 | Re-elevation, backup code consumed once, revoked grant refused on next request (564) | All three | Exact disposal tail | `StaffAuthority.e2e.spec.ts:56,72,86`; `VerifyAdminTotp.spec.ts`; deployed S1–S2 | covered |
| 10 | Admission slug owned by a foreign or root Dealership refused (634) | Admission cannot take over an existing Dealership or slug. | Foreign Dealership preservation | `BusinessMembership.e2e.spec.ts` (admission cases) | confirm; NP-1 if absent |
| 11 | Owner recovery cannot adopt a pre-existing foreign Dealership (664) | Ownership change only through audited founder recovery and recipient consent | Foreign preservation | `BusinessMembership.e2e.spec.ts:113,130` | confirm |
| 12 | Second reservation's Dealership excluded and preserved through first reset (692) | Members of one business cannot act on another. | Cross-reservation preservation | `BusinessMembership.e2e.spec.ts:100`; deployed B4 403 pairs using two clean-environment businesses | covered; deployed open |
| 13 | Stale candidate refused at operator boundary (721) | As 8 | As 8 | As 8 | as 8 |
| 14 | Redemption that would delete a pre-existing inventory baseline refused (740) | Owner admission invalidates fresh inventory proof. | Global `measurement_state` baseline preservation | `BusinessMembership.e2e.spec.ts:50`. In the clean environment, global baseline state is seeded and controlled. | covered; retire refusal |
| 15 | Elevation expired by API clock refused, kept through refresh, then re-elevated (825) | All | Disposal tail | `StaffAuthority.e2e.spec.ts:116`; `CheckAdminSessionElevation.spec.ts`; `RefreshSession.spec.ts`; deployed S2 | covered |
| 16 | Sales invite, replace, revoke, redeem and suspend with exact audits (907) | All, with audits | Exact disposal | `BusinessMembership.e2e.spec.ts:69,80,100`; deployed B1–B2 | covered |
| 17 | Foreign business invitation naming a roster User refused (1046) | Invitation binds to the intended signed-in User and reveals nothing on refusal. | Foreign business preservation | `BusinessMembership.e2e.spec.ts:69` | covered |
| 18 | Elevated buyer coordinator stays outside marketplace admin (1137) | Staff capability is separate from the marketplace admin role. | None | `StaffAuthority.e2e.spec.ts:56,157` | covered |
| 19 | Real command promotes only the coordinator, requires ordinary TOTP, redacts audit on reset (1159) | Audited exact-selector promotion and ordinary TOTP | Audit redaction on reset (reservation tombstone policy) | `packages/db/tests/promote-admin.command.test.ts`; deployed M6 actor | covered; deployed open |
| 20 | Other aliases and stale runtime candidate refused by the command (1216) | Exact selector refuses everyone else. | Stale-candidate refusal | `promote-admin.command.test.ts`; OT-GUARD | covered + gap (OT) |
| 21 | Command refused during cleaning and after disposal (1239) | Seed, bootstrap and promotion commands cannot write during reset phases. | Cleaning/disposed states | OT-QUIESCE (ingress and operator commands refused while a reset phase is open) | gap (OT) |
| 22 | Only the admitted Owner's generated contact code confirms; protected SMS evidence disposed (1266) | Contact code is bound to the seller, never signs in and lasts 7 days. Codes are observed only through a protected sink. | Sink disposal | `ContactPhonesController.e2e.spec.ts:144,250,336,359`; deployed B3 | covered; see Q4 |
| 23 | Support text, private notes and read state; redacted audit IDs; foreign cases preserved on repeat reset (1456) | Separate identities, private-note audience, read state, idempotent sends | Redacted audit IDs; foreign preservation | `ServiceMessaging.e2e.spec.ts:92,170`; deployed C1 | covered; deployed open |
| 24 | Close and reopen with current assignment and response debt (1587) | All | Repeat exact reset | `ServiceMessaging.e2e.spec.ts:170`; deployed C1 | covered |
| 25 | Closed Support purged at its inclusive stored deadline; reopened case preserved (1743) | Inclusive deadline, never purge a reopened case, delete private bytes, retry without revival | Exact reset proof; foreign preservation | `serviceRetention.spec.ts:5`; `ServiceLifecycle.e2e.spec.ts:59,99,126`; deployed C6 | confirm inclusive boundary; NP-2 if absent |
| 26 | Two due Support namespaces purged under their own authority (2153) | One sweep purges every due case exactly once. | Namespace authority/worker resolver | `ServiceLifecycle.e2e.spec.ts:59` | confirm; NP-2 |
| 27 | Ordinary reopened case reread after a selected worker waits behind the HTTP transaction (2190) | **Product race:** purge worker against concurrent HTTP reopen. The worker must reread and skip. | Selected-worker namespace | NP-3 direct product concurrency test with ordinary worker and HTTP | **gap; must not be dropped** |
| 28 | **FAIL :2299.** Selected Support worker skipped after an earlier exact reset disposes its namespace claim (2257) | A worker run after a case is erased makes no storage request and resurrects nothing. | Worker-versus-operator-reset ordering under the namespace advisory lock. The test itself notes its barrier design is unapproved. | NP-3 (late sweep after purge is a no-op with zero storage requests); OT-QUIESCE (no worker can run during reset); OT-RESTART | retire after NP-3 and OTs are green; **do not repair** |
| 29 | Personal and business drafts separate; suspended Sales work preserved (2345) | Context separation; revoked member keeps drafts and cannot publish | Retry disposal | `BusinessInventory.e2e.spec.ts:93,128`; `BusinessMembership.e2e.spec.ts:100`; deployed B2 | covered |
| 30 | Fenced generated contact send finishes before reset disposes sink (2679) | Send-once idempotency | Send/reset ordering | `HttpOtpSenderAdapter.spec.ts`; OT-QUIESCE (senders drained before delete) | covered + gap (OT) |
| 31 | Delayed contact carrier refused after reset; unrelated phone reuse survives (2682) | Two sellers may confirm the same number. | Delayed carrier after reset | `ContactPhonesController.e2e.spec.ts:284`; OT-QUIESCE and OT-RESTART (no delayed job survives) | covered + gap (OT) |
| 32 | Conditional business media kept through Sales removal; foreign keys refused; reset to exact object absence (2717) | Foreign keys refused; business stock and adopted media survive creator or member removal; product deletion removes bytes | Object absence on reset | `MediaOwnership.e2e.spec.ts:281,296`; `BusinessInventory.e2e.spec.ts:139,156`; `PurgeExpiredAccounts.e2e.spec.ts:145`; `CleanRetiredUploads.e2e.spec.ts:173,345`; OT-INV object count | covered; OT is operator-only |
| 33 | **FAIL :3288 publish.** Recorded publish generator fenced across recovery and exact reset (2984) | Expired publish claim returns to AVAILABLE with no cleanup. An in-flight generator PUT held across recovery cannot resurrect bytes. Foreign stock is unaffected. | Blocked reset while a generator is recorded; exact reset while the PUT is suspended; `campaign_object_ledger`; terminal and control resets | `CleanRetiredUploads.e2e.spec.ts:217,243,253`; NP-4 (held in-flight PUT across recovery and cleanup, no reset); OT-QUIESCE presign window | gap (NP-4); retire reset tail; **do not raise the 10 s abort** |
| 34 | **FAIL :3288 attach.** Recorded attach generator fenced across recovery and exact reset (2984) | Attach recovery retires the upload with a PENDING manifest. A late PUT is refused 404/409/412. S3 outage backs off 60 s, then deletion retries to DONE. | As 33 | `CleanRetiredUploads.e2e.spec.ts:173,199,217,468`; NP-4 | gap (NP-4); retire reset tail |

`:3288` asserts that a harness-held request outlives an approximately 14-second exact reset (diagnosed on `eb60330a`; no new duration conclusion for `a43ee64e`). This is operator-teardown timing, not product behavior. The product half is NP-4.

### Diagnostics and other v3 slices

| Slice | P retained | R retired | Proof | Status |
|---|---|---|---|---|
| `CampaignFullV3Diagnostics.e2e.spec.ts:253` template v1, private intake replay, foreign edges, exact disposal receipts (PASS 1/1) | Immutable published v1, idempotent private intake, ordinary authority, cross-audience refusal; `operationalApproval` stays null | Exact disposal receipts | `DiagnosticReports.e2e.spec.ts` (15/15, including contention 488 and 513); deployed X1–X4 | covered; synthetic center bootstrap is Q3 |
| History, payment, FIFO, export, PDF (never in v3) | Holds, FIFO, late funds, refunds, archive reuse without earlier purchaser, stale handover | Planned global-capacity partitioning | `ServiceMessaging.e2e.spec.ts:220,248,291,351,401`; `ServiceLifecycle.e2e.spec.ts:74`; deployed C2–C3 with controlled seeded capacity | product covered; deployed open |
| Diagnostic report, evidence, PDF, reinspection | As `DiagnosticReports` plus artifact worker | Graph journal | `DiagnosticReports.e2e.spec.ts`; `DiagnosticArtifactWorker.e2e.spec.ts`; deployed X2–X4 | continuity policy is Q2 |
| Measurement cohorts | Revocation, erasure, restore, suppression | Historical cohort import | `PrismaMeasurementStore.e2e.spec.ts`; `PrismaMeasurementRetentionLedger.e2e.spec.ts`; deployed A1–A3 from synthetic events created in the clean environment | collection closed |
| Video, push, socket, views, Support attachments | Private bytes, revocation, account purge, current-session push binding | Per-reservation object/job journals | `VideoAccountPurge.e2e.spec.ts`; `VideoUploadAuthority.e2e.spec.ts`; `DeliverServicePush.e2e.spec.ts`; `ServiceMessaging.e2e.spec.ts:123,157`; deployed V/M4/B4/C1 | private bucket U5 open |

No #897 criterion row is removed. Every joined journey in the [capacity inventory](full-v3-capacity-inventory-20261020.md#required-joined-ownership-versus-independent-groups) stays joined inside one clean-environment acceptance group.

## 3. Minimal operator contract

This is one target-bound procedure. It reuses the existing reservation ledger, identity/origin checks, migration authority, mock-transport checks and latest-main restoration from [staging controls](../../agents/shared-staging-controls.md). It is not a generic fixture framework or a production cleanup API.

### 3.1 Targets

| Target | Identity | Credential | Live state |
|---|---|---|---|
| Staging | Project `176ddec0-…`, environment `652abc79-…`, API and worker service IDs from staging controls (discovery 2026-10-15) | Exact-environment project token through `STAGING_RAILWAY_PROJECT_TOKEN` | Token **refused** earlier. Database, media, public-media and API origins **UNKNOWN** (placeholders). Not retried. |
| Production (separate manifest) | Environment `c628b9bf-08ef-45f6-976f-3d646e0ebfbd` per the runbook. Project/service IDs, origins and buckets **UNKNOWN**. | Separate founder-held production credential. Agents never receive a staging credential for production or the reverse. Volume-file deletion is human-run (runbook §Production foundation). | **UNKNOWN**. No reviewed production operation exists. |

Each target has its own manifest file and operation. Neither is defaulted from a name, URL or the other target. A staging manifest presented to production identity, or the reverse, refuses before any read of application data.

### 3.2 Inventory and reference delta (gate before any delete)

Per target, independently: application and `cf_*` schemas with row counts; object keys, versions, delete markers and multipart uploads per bucket; BullMQ queues (active, waiting, delayed, retry, repeat schedulers), outboxes and session/cache prefixes; mock delivery sinks; external sandbox artifacts. Provider-owned or unenumerable artifacts are listed as such and never reported deleted. Shared Redis databases and buckets outside the inventory are out of scope.

Compare each live database with a clean database seeded from pinned repository inputs. Classify every difference as approved reference edit, disposable scenario state, protected configuration or unresolved. Unresolved rows go to a restricted export and block deletion. Current seed limits per the plan: no Generations in `seed.ts`; exchange rates create-only; admin-uploaded logo directories preserved; demo/reviewer/tester fixtures are not the full reference set. **Seed sufficiency and intentional deployed edits are UNKNOWN; no live comparison has occurred.**

### 3.3 Protected configuration and control ledger

Never deleted or rewritten: Railway projects, services, variables and secrets; signing identities; domains; bucket policies; database roles and extensions; `_prisma_migrations`; resource limits; `refs/heads/ops/staging-lease` (Git, outside every target). The reset operation's own phase receipts live in that ledger, not in the target database. Configuration stored in the database or Redis is identified before classification.

Production also protects Play reviewer access: `REVIEW_DEMO_ACCOUNT_ENABLED`, `REVIEW_DEMO_ACCOUNTS_JSON` and the tester list stay unchanged. Reviewer scenario, tester accounts and demo inventory are reseeded through their existing runbook commands, so App access keeps working. The reset is not run while a store review depends on them unless reseed is proved first.

Existing `cf_*` terminal schemas, delivery journals and permanent BullMQ dedup tombstones are inventoried as **retained control metadata**. They are deleted only under Q1.

### 3.4 Quiescence, including signed uploads

1. Close write ingress: signups, publication, mutations, contact, report entry and service entry flags off; API write routes refuse; webhooks and callbacks disabled.
2. Stop every application worker replica and scheduler, plus API-hosted producers (outboxes, measurement, push). Pausing queues alone is insufficient. Existing maintenance mode is a tool, not proof.
3. Drain or terminate in-flight work under a bounded procedure. Verify: no active transactions from application roles, no active/waiting/delayed jobs, no live worker heartbeat, no stale replica.
4. Signed uploads: after ingress closes, no new URL is issued. Wait out the longest outstanding grant — 600 s for listing, chat and brand-logo presigns, up to 900 s for video part URLs — measured from the close time. Or apply a reviewed temporary bucket write-deny that does not alter retained policies. Abort incomplete multipart uploads. Record the close time and the window or deny receipt.
5. Monitoring stays on.

Any check failing or unknown refuses deletion.

### 3.5 Delete

One explicit target-bound action deletes only inventoried application state: rows, objects (all versions and multipart state), queue keys and session prefixes. No blanket `FLUSHALL`, `DROP DATABASE`, bucket deletion or project/service/volume removal. Each phase writes a durable receipt (operation ID, target, candidate, phase, counts) before and after its side effect.

### 3.6 Migrate, reseed, verify

Apply schema through the API pre-deploy migration authority. Load the versioned reference bundle; verify counts, checksums, relations and objects. Bootstrap only required synthetic actors through `bootstrap-staff` and the audited admin command; authenticate with ordinary OTP and TOTP. No reusable tokens, fixed codes, seeded enrollments or seeded elevation. Synthetic centers and providers assert no real rights and activate nothing.

### 3.7 Interruption, retry and reopen

A lost response or interruption is inspected from receipts. Only the same operation ID, target, owner and candidate continues, from the last completed phase. Changed authority or a missing receipt leaves the operation **blocked** with a named owner. Then restart the intended candidate with safe test transports. Verify readiness, ordinary sign-in, reference state, private-object policy, and absence of stale jobs. Repeat the object inventory after one full presign window to prove no late object appeared.

### 3.8 Restore, release and public-launch cutoff

After acceptance, quiesce again, dispose of scenario data, restore the latest fetched `main` with its compatible reference bundle and verify deployment IDs/SHA, migrations, readiness, worker boot and absence of candidate fixtures before release. A reset/reseed rehearsal is not the #920 restore drill.

Public launch ends the authority. The launch checklist removes it. Production invocation must then refuse in code, not only by policy, before any read of application data. Staging resets continue only under ADR-0098 reservations. Production reset is scheduled separately and authorizes no production deployment.

### 3.9 Required operator tests (hosted disposable services)

| ID | Must refuse or prove |
|---|---|
| OT-GUARD | Wrong project/environment/service, name-only target, cross-target manifest, missing authorization, stale candidate, post-launch marker — all refuse before deletion |
| OT-INV | Unknown table, schema, prefix or bucket refuses; a foreign Redis prefix and an out-of-scope bucket object survive |
| OT-QUIESCE | Live worker, active/waiting/delayed job, open ingress, active application transaction, unexpired presign window or open multipart — each refuses before deletion; operator commands refused during an open phase |
| OT-SEED | Incomplete bundle or checksum mismatch refuses; empty target reconstructs; second run changes nothing; unexpected pre-existing rows refuse |
| OT-RETRY | Interruption after each phase and a lost response resume only the same operation; changed authority refuses |
| OT-RESTART | No stale job or delivery after restart; no late object after the presign window; ordinary sign-in works |
| OT-RESTORE | Latest `main` fetched; moved `main` refuses release |

## 4. Operational clauses superseded for this acceptance path

Mutable guidance only. ADRs are not edited. ADR-0098 point 4 already makes staging data disposable and permits reset within a reservation. The **production** prelaunch reset rests on the founder decision in #897; Q5 asks whether it also needs an ADR.

| Clause | Location | Disposition |
|---|---|---|
| Fixture "never truncates shared tables"; cleanup refuses unexpected references; "Never repair them with ad hoc deletes against staging" | staging controls, real fixture and campaign sections | Unchanged for v3 profiles. The clean reset is a separate reviewed operation, not an ad hoc delete. |
| Unknown domain writes need "a separately implemented cleanup profile" | staging controls, campaign profile | No longer an acceptance dependency |
| Business v2 / v3 extension as the route to acceptance | staging controls; matrix Fixture rule and U1 | Superseded by this contract; extensions stop |
| "Reset exactly … never reseed" | matrix staging sequence step 4 | Superseded: quiesced clean reset and reseed between groups |
| Halt: "Do not broaden the reset, delete by pattern, reseed" | matrix halt and recovery | Narrowed: still no pattern deletes or unreviewed reseed; the reviewed clean procedure is allowed |
| Foreign-reservation preservation inside acceptance groups | matrix execution order step 2 | Superseded by exclusive reservation; tenant isolation retained |
| "Production remains reviewer-only…" | runbook Step 4 | Retained; reset must preserve reviewer access (§3.3) |
| Volume deletion is human-run; no `FLUSHALL` repair shortcuts | runbook production foundation | Retained |
| Repository suites never run on staging | shared staging | Retained; the operator reset is not a test suite |

## 5. Unresolved architecture questions

- **Q1.** Retained v3 control metadata (`cf_*` tombstones, delivery journals, permanent dedup keys): delete in the clean reset once v3 entry points are proved closed, or keep as inert inventory?
- **Q2.** Diagnostic manual/changed-identity continuity and public commissioner/Listing transfer stay unresolved (D2/D3). A clean database approves neither.
- **Q3.** Which existing bootstrap can create the synthetic center, qualification and staff safely without the v3 reservation path?
- **Q4.** Protected code observation in an exclusive environment: reuse the reviewed email and SMS sinks without reservation namespaces, or keep them namespaced?
- **Q5.** Does the production prelaunch reset need a short ADR in addition to the #897 founder record?
- **Q6.** What is the launch marker that the code-level production refusal reads, and who sets it?
- **Q7.** Temporary bucket write-deny versus waiting out the presign window, given unknown bucket policy on both targets.

Live access, origins, seed sufficiency and intentional deployed edits are **UNKNOWN**. Staging Railway authority was refused and is not retried.

## 6. Next smallest brief

One product test writer, before any operator code: **NP-3** and **NP-4** in existing product suites (`ServiceLifecycle.e2e.spec.ts`, `CleanRetiredUploads.e2e.spec.ts`), with no campaign reservation.

- NP-3: ordinary Support purge worker against a concurrent HTTP reopen; the worker rereads and skips. A late sweep after purge makes zero storage requests.
- NP-4: a generator PUT held in flight across claim-deadline recovery and cleanup is refused and resurrects nothing. Cover publish and attach.

Record RED or the existing-coverage proof, then GREEN. Confirm rows 10, 11, 25 and 26 at the same time and add NP-1 or NP-2 only if needed. Then, as a separate reviewed writer, implement OT-GUARD and OT-QUIESCE first. Only after both are green does the assembly retire the reset tails of rows 28, 33 and 34.
