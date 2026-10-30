# Candidate A operational row contract review r1

Fixed source: db23bc501abd57361e10ea034f6cd7df73640de5. Independent source-only review, 2026-10-29. Inputs: exact row-dependency brief, reset-exclusion review section 6, and ed694833 DB-owner proposal. No runtime claims, SQL, tests, builds, installs, live operations or repository edits.

## Decision

Conditionally feasible; the proposal needs the concrete admission and campaign transition below before dispatch. No existing supported path satisfies whole-reset acceptance. No missing external permission is proved. This is required existing A dependency work, not broader research. Keep 162 immutable and reserve no migration number in this review.

Current source corrects one historical input: StagingControl.cleanReset now exists at scripts/staging-control.mjs:166-295. It persists closure generation and reaches inventory-ready; it authorizes no row effects. RailwayPlatform still lacks its concrete clean-reset adapters. The row program still lacks owner/closure binding. Do not describe these prerequisites as already wired or deployed.

## Source findings and existing alternative

The fixed executor at scripts/staging-clean-reset-remote.mjs:302-364 already compares inventories, locks all public tables, reobserves, truncates and records completion; lost-response replay checks the recorded poststate. Its receipt is logically immutable in this program, not protected by an existing SQL immutability trigger. Its operator-schema validator currently forbids extra functions/triggers. Both need coordinated change for DB-enforced admission/completion.

planTables at staging-clean-reset.mjs:223-236 correctly refuses any TRUNCATE trigger. The remote executor also refuses every cf namespace before planning. Therefore a fresh fully migrated fixture can refuse in the real inventory/planner before reaching line 347. Do not claim a reached SQL TRUNCATE or manufacture one by removing guards.

Ordinary source preparation rejects preheld resource locks. Maintenance162 supplies only three finite compatibility operations; it does not authorize physical User disposal. Account purge preserves its User/witness contract. None is a whole-reset alternative.

The concrete existing alternative for supported campaign-only cleanup is staging-campaign.mjs:1293-1339: commit cleaning, dispose owned delivery/object work, exact child-first deletes, redacted retained audits, terminal disposed tombstone and observe-only retries. It retains cf control state and requires retained audit presence; deleting those audits afterward breaks its terminal contract. It refuses foreign graphs and later report/evidence/PDF dependencies at :870. Use it unchanged only when its narrower outcome suffices. It cannot close required A.

## Minimum implementable admission

Use the existing authenticated operator transport, actorIdentity/Git-CAS reservation and current closure operation. Extend that controller's exact phase handoff; do not make the remote payload a new public command. Before rows, reauthorize the actor, target and current operation revision, reobserve continuing exclusion, then persist rows intent with:

{operationId,reservationId,owner,candidate,targetIdentity,closureGeneration,closureEvidenceDigest,expectedInventory:{schema,retained,disposable},planDigest}.

Bind the executor artifact and exact classified row/campaign inventory through planDigest. A matching string, environment variable, GUC, or caller-shaped JSON does not establish admission. The fixed trusted runner obtains the binding from current durable state and attested target, rather than trusting its caller's copy.

Inside PostgreSQL, install a small operator-owned admission/completion store and functions through the sole DB owner's additive migration. Use the already authenticated operator database principal; runtime roles must have no authority to create or alter the admitted record. Enforce that with actual ownership/ACL checks and restricted-principal negatives, without granting ordinary roles anything new. Source does not identify a separately authenticated production operator role today: prove the existing transport's effective role/ownership before claiming isolation. Under the accepted threat model, a privileged operator with DDL authority remains trusted. No new IAM hold or new credential system follows from this observation.

Admission seals server-observed full OLD tuples/keys, backend PID and full transaction ID, binding and plan digest. A transaction-local handle may locate that record; it is not authorization. No SECURITY DEFINER escape or ordinary callable JSON admission. If the actual operator role cannot establish this store, report that observed privilege failure then, rather than presuming a missing permission now.

## Lawful finite effect

Lock the complete public and selected campaign table set in deterministic order, then exact namespace fences in the existing table-before-namespace order, and operator authority. Reobserve under locks before admission/effects: schema definitions, FK actions/deferrability, triggers/enabled state, public plus selected cf contents, protected/reference contents and exact keys. Refuse active source/campaign receipts and other backend authority. Preserve receipts from previous completed operations.

Use a fixed DELETE plan, not a generic graph executor. Its graph certificate must pin actual columns/actions and trigger effects, not merely FK endpoint names. Disallow unknown relations/functions/triggers and unexpected sequence changes. Retained tables and approved reference contents stay exact. Explicitly classify blog/market knowledge and approved diagnostic-center inputs; current refuse-if-nonempty/refuse-if-approved classifications cannot silently become delete.

For diagnostic rows the executable order is proofs first, report evidence/PDF, reports with referring corrections before predecessors, requests, anchors, ownership components, identity evidence with referring corrections first, raw records and provenance, grants/remaining order children, orders, then their source parents. Report/proof request-deletion triggers can run normally against already sealed request keys. Proofs go first so ordinary invalidators find no surviving proof; anchors precede raw/source deletes so sticky-anchor UPDATE effects find no target.

Actual FKs explain why owner changes are necessary. Raw.orderId, component.identityRecordId and anchor.orderId are CASCADE dependencies, while raw/evidence/provenance DELETE guards demand the order absent, component guard demands raw absent, and anchor guard demands a source receipt plus order absence. Reports pin raw/evidence/order through RESTRICT; there is no actual report-to-proof FK for continuityProofId. Do not invent one from the source registry.

Add exact sealed-OLD DELETE admission only to diagnostic_identity_record_immutable, diagnostic_identity_evidence_guard, diagnostic_identity_provenance_guard, diagnostic_ownership_guard and diagnostic_source_anchor_guard, ahead of their parent checks. Preserve their original ordinary branches. Enabled source statement/row/purge/enquiry and campaign preparation guards also need DELETE-only admission checks for this same record. Statement admission must bind the selected relation; each row still checks full OLD/key. Do not exempt all DML or alter ordinary preparation/completion. Delete dependents explicitly so declared CASCADE/SET NULL actions find none. Remaining actual cycles, UPDATE-producing effects or unproved ordering refuse before effects; do not widen to UPDATE to make them pass. Examples needing explicit refusal/proof include mutual users.suspendedById references and Listing/video-generation cycles.

Obsolete cf state requires its own owning transition, not just immutable-guard changes. The campaign owner must add an exact global-closure abandonment branch to its existing trackers/admission/worker namespace readers: bind the sealed namespace definition and all control rows; accept only exact sealed DELETEs; suppress campaign journal UPDATE/INSERT for these deletes; end with an inert abandoned state that cannot admit/resurrect business or deliveries. Delete classified campaign row contents explicitly, retain schema/functions/triggers unchanged, and keep the authoritative terminal receipt outside the disposable namespace. Unknown historical tracker definitions refuse. A new global bypass in campaign_row_namespaces is insufficient. Until these owner paths and terminal-reader behavior are proved, cf inventories remain a specific blocking gap.

Bounds for this dispatch: at most 10,000 total disposable tuples including cf rows, 8 MiB canonical sealed plan, 10-second lock timeout, 240-second statement timeout and 300-second subprocess bound; cap the whole transaction at 240 seconds as well. These are proposed operational ceilings, not ordinary 100/1000 limits. Enforce before effects and at completion; refuse overflow, no batching around caps. Parent may lower them or explicitly dispatch a measured revision. The finite graph and timeout evidence must demonstrate the selected fixture fits.

## Completion, owners and proofs

Deferred commit enforcement must reject an admitted unfinished transaction even if a caller omits finish. Finish requires exact disposable absence, unchanged schema/retained inventories and unchanged binding, then commits one immutable receipt. Deny receipt UPDATE/DELETE/TRUNCATE; keep only the already bounded Redis-state CAS transition. Adapt operatorDefinition validation and Redis receipt projection/digest checks together, preserving prior receipts and current Redis intent/lost-reply semantics.

Same-operation replay reobserves and compares the immutable receipt and poststate under consistent locks. It issues no admission/DML/DDL. A changed binding or new row refuses; it never enlarges the plan. Lost COMMIT reply consults that receipt before any retry.

DB owner: next actually unused additive migration after162, packages/db/tests/operational-reset-rows.e2e.spec.ts and packages/db/CONTEXT.md. Reset owner: controller/platform authority handoff, fixed executor/planner/table manifest, campaign owning transition/readers, and packages/db/scripts/staging-clean-reset*.e2e.spec.ts. Parent resolves campaign-path ownership explicitly. Do not overlap the R7g cost profiler.

First RED: invoke the actual serialized executor on a fresh migrated, representative fixture after valid target setup. Preserve its earliest reached planner/guard refusal, with real database diagnostics and whole-state equality. Distinguish planner TRUNCATE-trigger refusal, cf refusal, SQL guard refusal and setup/import failures. After admission wiring, preserve the next genuine SQL DELETE refusal before changing that owning guard.

Minimum GREEN: representative diagnostic/report/proof, Session/device, User/Listing and supported obsolete campaign disposal; exact retained/schema equality; wrong/missing principal and every binding field; forged GUC/JSON; stale/extra/protected tuple; active receipt/backend; unsupported graph; halfway failure rollback; COMMIT without finish; killed transaction; lost commit reply; completed replay with zero effects and immutable receipt equality. Preserve ordinary source/campaign/maintenance162 negatives, limits, preheld-lock and rollback cases. Exercise the real executor and enabled guards, not stubbed SQL outcomes.

Standards and Spec review remain separate on the assembled SHA. Hosted disposable PostgreSQL proofs establish repository behavior. Provider/storage closure, live identity, reservation, restoration and final deployed acceptance remain the reset owner's separate existing requirements. Optional future hardening includes general reset tooling, arbitrary graph coverage and stronger administrator-resistant isolation; none blocks A beyond the concrete gaps above.
