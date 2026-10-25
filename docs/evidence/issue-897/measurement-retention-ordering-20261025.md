# Measurement retention implementation checkpoint, 2026-10-25

The retention transaction now locks the existing collector row before deleting any fact or parent. The assigned purge corrections compare due time in SQL, send only consumed command fields, use the server's protected User projection, erase the account measurement principal and invalidate all restricted investigation exports. Three existing purge assertion queries cast their void result to text. This is an implementation checkpoint for parent inspection. Source acceptance, runtime acceptance and G1 acceptance are not claimed.

The full local PostgreSQL matrix at source `2bd93f388053188f8e804adc26203a6ca41b69a5`, tree `f72dfae5f0490be6ec12f9920e07213a59feaa2c`, attempted 34 cases under `TZ=America/New_York`: 25 passed and nine failed, none skipped. The nine purge cases fail before preparation completes at the shared `diagnostic_source_effects_before_intake` local `e` ambiguity, SQLSTATE `42702`. They do not prove purge completion, purge rollback or the intended purge opposition. That correction belongs to R7b. No uncommitted SQL fragment was applied.

The [JSON receipt](measurement-retention-ordering-20261025.json) records exact commands, command/log SHA256s, file hashes, counters, failures and resource ownership. The [effect inventory](measurement-retention-effects-20261025.json) records 45 physical FK entries and all 300 trigger definitions on the affected direct, cascading and named triggered tables. It comes from actual migrations in an isolated task-owned inventory database. Bootstrap trigger modes in that inventory are distinct from temporary fixture activation.

| Ref | Exact identity |
| --- | --- |
| Base | `de80c7b572a8e2b5df832774bef751a6e299fc4f`, tree `8190e99411eadb4904c9187b2fc31555f4cdc9e5` |
| Reserved branch | `agent/issue-897-measurement-retention-20261025`, pushed before edits |
| Initial purge dependency | `311637ca601780fdcffb74def6e88ce473aba339`, tree `322437213c9e3db5fe379d04ff65994d2e291f39` |
| Dependency merge | `eb54e756d33014662abe6116804257763e24eb72` |
| Original retention RED | `bc6fab896a0743cf132d79ce9a7fa6446bc41b6f` |
| Initial retention implementation | `de11b8d82e15045e0a8879190466bc917de793ca` |
| Initial SQL fixture checkpoint | `a45fff31cca4eeb04242a8d510caaf236102e7b5`, tree `63fcc6656a48d940bd0edfe842a8159b7cdfc3fd` |
| Purge correction RED | `7082b9bc`, full hash in receipt |
| Purge caller correction | `7427c8a76cd5deb9490b38897a9c1c230fb0fba0`, tree `ea239f70f13806ca619392a9fecf41dc19b3ee30` |
| Helper assertion transport | `6a42352d`, full hash in receipt |
| Shared runtime dependency | `30f93f05ebc672a99038d70cf2b2955613262667`, tree `cd9825f208665de63609adb51aae67c5474633c5`, parent exactly base |
| Runtime dependency merge and verified source | `2bd93f388053188f8e804adc26203a6ca41b69a5`, tree `f72dfae5f0490be6ec12f9920e07213a59feaa2c` |

The shared dependency's additive `20261025015000_diagnostic_runtime_transport_corrections` migration and retained mirror both hash to `520c94deedd51c039f82b396b6bf08acd551838bc37698ca0a345aa92a165424`. Its eight paths are inherited dependency bytes, not retention-owned changes. No publication or claims-transport ancestry was consumed. The initial purge receipt and handoff remain at `/tmp/897-r6c-parent-source-acceptance-20261025.json` and `/tmp/897-r6c-account-purge-20261025-handoff.md`. Parent withdrew acceptance of the affected caller assumptions when execution disproved them; the old receipt remains historical evidence.

The owner changed these source/test paths:

- `apps/worker/src/jobs/PrismaMeasurementRetentionLedger.ts`
- `apps/worker/src/jobs/PrismaMeasurementRetentionLedger.spec.ts`
- `apps/worker/src/jobs/PrismaMeasurementRetentionLedger.e2e.spec.ts`
- `apps/worker/src/jobs/MeasurementRetentionOrdering.e2e.spec.ts`
- `apps/worker/src/jobs/application/testing/MeasurementRetentionDatabase.ts`
- `apps/worker/src/jobs/application/testing/MeasurementRetentionPostgresFixture.ts`
- `apps/worker/src/jobs/PurgeExpiredAccounts.ts` and its direct `.spec.ts`
- `apps/worker/src/jobs/diagnosticAccountErasure.ts`, `serviceAccountErasure.ts`, and `video/videoAccountErasure.ts`, each with only its existing assertion result cast to text

Own evidence documents are additional paths. `ExpireMeasurement.ts`, both ListingView expiry production files, all API measurement/capture contracts and all pre-existing DB/schema/migration/mirror bytes are unchanged. The shared dependency owns its additive migration, schema registration and transport changes. One owner implemented this work without nested agents or reviewers. The parent checkout and PR904 were not changed.

The original no-SQL/no-runtime brief was superseded by `/tmp/897-founder-autonomous-candidate-authority-20261025.md`. Parent subsequently assigned the two observed purge defects, the missing existing measurement erasure effects, the protected User projection correction and the three assertion casts. Original failures, counters and refs remain. The pre-runtime and pre-purge receipts are retained with hashes in the current receipt. The historical static-audit log's runtime-zero footer describes its original phase only.

The complete retention transaction remains bounded:

1. Existing `SET LOCAL statement_timeout = '2000ms'`.
2. `SELECT epoch FROM measurement_state WHERE key='collector' FOR UPDATE`. Refuse an absent collector before any DELETE. Do not create or rotate an epoch.
3. Six existing DELETE CTEs, in their original order: records, outbox, principals, visits, rollups, investigation exports.
4. Return the sum of the six direct deletion counts. FK cascades remain excluded from that sum.

Records, outbox, principals, rollups and exports keep `expiresAt <= now`. Visits keep `foregroundAt <= now - 90 days`. Each table independently keeps its ordered due selection, limit and `FOR UPDATE SKIP LOCKED`. Nullable account principal expiry remains untouched. A due guest principal can cascade fresh children under the existing erasure policy. The prefix is the entire seven-line retention production delta; all six CTEs, the sum and the backlog query remain byte-identical to base.

The deletion transaction retains `timeout:10000` and `maxWait:1000`. `oldestExpired` remains a plain six-table UNION read, with visit expiry translated by 90 days, `timeout:3000` and `maxWait:1000`. `ExpireMeasurement` keeps defaults 500 by 20, allowed batch size 1..1000 and batches 1..100, the 30-second loop budget and the 24-hour health threshold. A busy or absent collector makes work unavailable and leaves due work pending atomically.

The original source counterexample was retention holding record R before seeking visit V while prepared purge held V before seeking R. It was a static cycle, not an executed deadlock. The collector prefix serializes these transactions before either fact set is locked. Retention never seeks a User or source lock afterward. Actual purge namespaces are collector 898200, principal 898201, visit 898202, record 898203, outbox 898204, exports 898205 and rollups 898206.

The actual caller coordination was traced through the store and worker:

- Authenticated bootstrap locks User, then collector SHARE, principal UPDATE and visit. Guest bootstrap starts at collector SHARE. Both refuse absent/current-epoch mismatch; ordinary bootstrap never initializes the collector.
- API append and worker collector take collector SHARE before principal UPDATE and facts. API conversion checks read Listing/member state without a late source lock. Worker append preserves epoch/generation refusal.
- Commit capture already holds its source/User fence, then uses a savepoint, 50ms statement/10ms lock bounds, collector KEY SHARE, principal KEY SHARE, an unlocked User recheck and outbox INSERT. Shared capture/store contracts were consumed without edits.
- Guest erasure and restore take collector UPDATE before exports/principals. Restore is the real absent-row initializer. Retention uses the existing current row to coordinate deletion of due data from all epochs.
- Recompute/read/export paths take collector SHARE before downstream locks. Outbox delivery completes queue discovery before collector append, then deletes its queue row separately; it does not retain an outbox-to-principal lock pair.

Retention's direct/FK/trigger effects are finite. `measurement_principals.userId -> users` is ON DELETE CASCADE in the User-to-principal direction; retention never deletes User. Principal deletion cascades visits through both `principalId` and `linkedAccountId`, records through `principalId`, and outbox through `principalId`. Visit deletion cascades records through `visitId`. Rollups and investigation exports have no physical FK. Export session/audit/actor IDs are logical references; new fixtures still create real Session and Audit rows. There is no FK path from these DELETEs to a source/User write.

Measurement facts are outside the campaign tracking list and strict source guard specifications. Their dormant `zz_diagnostic_source_purge` trigger only enforces an already prepared account-purge receipt in the same transaction. Retention creates no receipt. No TRUNCATE occurs. The collector row is only locked, so inventory-baseline DELETE triggers are not invoked. A task fixture may temporarily enable existing guards after lawful setup, verifies readiness and restores every original D/O/A/R mode. It creates no campaign namespace or admission.

The complete purge transaction was compared with the derived direct, trigger and FK effects once. Initial scheduler selection and independent 30-day OTP cleanup precede one interactive transaction per account. Unlocked SQL rediscovery now applies the authoritative due cutoff and server User projection, then compares selected phone/email. The command keeps operation, roots, OLD/NEW, cutoff and null actor/session/campaign. Preparation precedes ownership disposal, source locks and all mutations. The three erasure helpers preserve their lazy promise order and outer receipt assertions.

Direct purge writes retain the User tombstone while clearing sign-in/profile PII; delete its sessions, TOTP enrollment, devices, notifications, preferences, searches, favorites, garage, both blocked-user directions, membership, personal drafts, verified phones and matching own/signed-out OTP requests; clear personal Listing contact; retire profile uploads and record exact cleanup. The added measurement writes invalidate every restricted export and delete only principals with this User ID. FKs remove their visits/records/outbox and linked current guest visits. Independent guest visits, guest outbox, foreign principals/facts and rollups remain outside this erasure.

Read-only diagnostic helpers retain report/identity payload erasure and private artifact cleanup fences, author/reviewer/staff detachment, proofs and assignments disposal, immutable historical snapshots and intake erasure last. Service helpers retain conversation fences, messages/outbox/subscriptions/read-state deletion, attachment/attribution disposal and support/history privacy rules, including holds and permitted anonymous knowledge. Video helpers retain validated exact cleanup inventory before personal video retirement, cancellation and grant revocation; business inventory remains independent. Ownership disposal handles grants/components/anchors before later effects. These existing selectors and rights rules were not rewritten.

Purge's physical cascade closure additionally includes TOTP backup codes, session-owned video grants, session/device push subscriptions and session-owned continuity requests. Proof-deletion/report-binding/order-erasure triggers delete their exact continuity requests. Source transition triggers invalidate or erase anchors; continuity triggers invalidate proofs; membership/User enquiry triggers requeue assigned business Conversations with their exact audits. Prepared guards enforce the derived scope and final tuples; receipt DELETE runs all completion checks. The catalogue inventory lists every physical FK and trigger definition, including dormant source/campaign guards, constraint guards, evidence/history immutability guards and OTP compatibility handling. It is an inventory of reachable effects, not proof that every populated service/video/diagnostic branch has executed in this retention suite.

Offline evidence is meaningful RED/GREEN. The original retention RED had two failures and four passes: busy and absent collectors attempted deletion. The prefix made all six pass. The new non-UTC purge RED had two failures and four passes: exact due returned zero and an overdue command included unused intent. The missing-measurement-erasure RED retained the account principal. Corrected focused checks pass 29 tests. The final offline worker suite passes 311 tests across 43 files; worker typecheck, TS6, lint and build pass. Contract/DB build and generation receipts are recorded. Generation used a nonconnecting URL until disposable SQL execution was authorized.

The final authored PostgreSQL matrix has 34 cases, all attempted in the full core150 run:

| Cases | Count | Observed result |
| --- | ---: | --- |
| Existing raw/outbox exact boundary | 1 | Pass |
| Independent limits, boundaries, cascades, counts and backlog | 1 | Pass, direct count 6 with limit 1 |
| Absent collector; current fence with older epoch; locked due row; busy fence | 4 | Pass, exact refusal/lag/preservation and subsequent drain asserted |
| Rollback after each actual retention DELETE | 6 | Pass, all six tables restored atomically |
| Collector/retention, guest erasure/retention, restore/retention, bootstrap/retention, both orders | 8 | Pass, exact counts/events/foreign preservation |
| Overlapping retention sweeps | 1 | Pass, 1+1 without double-counting |
| Future/cleared cutoff or changed phone/email after scheduler selection | 4 | Pass, zero purge and no receipt; own/foreign facts preserved |
| Purge/retention both orders and collector/purge/retention overlap | 3 | Fail before preparation completes at shared `42702`; intended blocking/outcomes remain asserted |
| Already-erased account positive and linked-guest/global-export positive | 2 | Fail at shared `42702`; completion unproved |
| Rollback after actual purge export/principal/User/finish operations | 4 | Fail at shared `42702` before injection; rollback unproved |

The fixture dynamically loads the actual API store, uses its real initializer/bootstrap/linking/guest erasure/restore, and calls the real worker collector, retention ledger and corrected production purge. Synthetic export fixtures create real Session/Audit rows; phone/email race fixtures satisfy verification checks. Raw hooks pause only after actual SQL; ORM hooks preserve lazy Prisma promises and observe actual writes. Lock assertions query PostgreSQL blocking relationships. Every started race task has an immediate rejection handler, every barrier releases in `finally`, and every started promise drains through `allSettled`, including fixture teardown. Missing disposable isolation fails explicitly. No test-written source command substitutes for the production purge.

Five original runtime runs and four later correction runs remain in the receipt. Original totals were 77 case attempts, 45 passes and 32 failures, with 48 explicitly unselected cases across filtered runs. After the full core150 matrix the cumulative totals are 121 case attempts, 76 passes and 45 failures, with 127 unselected across diagnostic filtered runs. The earlier single diagnosis case asserting the old intent refusal was replaced after its assigned fix by the four production stale-snapshot cases; its code/history/log remain at a45. It is not counted as a current acceptance case. No unchanged failure was rerun without a concrete correction or new diagnosis.

Remaining work is the committed R7b `e`-ambiguity correction followed by affected full-matrix verification. The original timezone, command-shape and projection failures now progress beyond their former refusal points, but successful purge completion is still unproved. Missing measurement erasure was initially static and masked; its new production writes and stronger fixtures remain runtime-open. The three assertion transport sites are source-corrected and offline-verified, also masked by preparation. No timeout was padded, assertion weakened, shared source edited or access refusal bypassed.

Only task-owned `postgres:17-alpine` containers were used on loopback ports 50373 and 52014. Worker databases are created from real migrations and dropped by the existing lifecycle; the separately owned inventory database is also dropped. Final resource cleanup and final pushed HEAD/tree are pinned in `/tmp/897-measurement-retention-20261025-handoff.md` and its adjacent final receipt. Hosted CI, HTTP, shared staging, parent aa7f diagnostic, B5, device/store/deploy actions were not executed by this owner. Parent retains assembly and combined B1-B5/G0-G4 authority.
