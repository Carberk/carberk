# #897/#914 public automatic continuity contract closure

Status: engineering handoff for the source writer; not Standards/Spec approval.

## Exact base and evidence

- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-41d9e2f5`
- Parent/local base: `1d8128d56c1064c027b693f541187466d44b77e0`
- Published production source to match: `0aaff93731cd9b1a5a6c9ab6e76527b236dddda2`
- Genuine reached RED: run `39884355600`, API job `120189010381`; `DiagnosticPublicTransferProof.e2e.spec.ts:796` expected 201, actual 403. Preserve the positive and all negative HTTP tests.
- Rejected child `f0824f32c9821fb2e93b3ae223a00e1a93e6d336` / local `9c7f7a6f` was reverted as `07d328ea67df9864061619559b83f7089bee0553`; do not reapply.
- Controlling review: `docs/evidence/issue-897/public-automatic-ownership-contract-review-20261022.md`; continuation: `docs/evidence/issue-897/0aaff-hosted-results-and-next-slices-20261023.md`; policy: `docs/adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md`.

## What source currently proves

`DiagnosticPublicBindings.lock` discovers public order targets, then locks Users through the identity publisher port, Listings, and orders; it is used by `PrismaDiagnosticContinuityProofs`/`PrismaDiagnosticReports`. `PrismaBusinessRepository.locks` currently locks actor/target Users then Business, while `PrismaAccountDeletionUnitOfWork` schedules User, discovers/deletes membership, changes Business, and archives Listings in one transaction. `PrismaBusinessRepository.recover` locks founder/new owner and Business before discovering/deleting the old owner. This creates a possible Listing -> order -> User/Business cycle once an order-writing trigger is added.

`20261022180000_diagnostic_public_continuity/migration.sql` invalidates only unused proofs from current Listing/User/Business/member/status fields. `diagnostic_identity_record_immutable` authenticates an INSERT only against current order version/observation; it does not bind a historical ownership fact. PostgreSQL nullable JSON predicates can yield UNKNOWN. The existing `diagnostic_continuity_proof_bound`/report guards and `diagnostic_public_continuity_atomic` are the SQL admission/atomicity boundaries. Worker erasure (`diagnosticAccountErasure.ts`, `PurgeExpiredAccounts.ts`) searches current commissioner/staff ownership and clears whole identity content; it does not discover historical sellers or component-redact ownership.

## Implementable mechanism (smallest bounded slice)

Add two forward-only, restricted database facts; no legacy backfill or guessed history:

1. **Per raw identity record, `ownership_fact`** (strict columns or a strict JSON object plus a CHECK): source Listing id, seller User id, nullable Business id, nullable membership id, commissioner User id, normalized Listing identity digest, and an explicit state (`available`, `legacy_unavailable`, `erased`). Bind it to the raw record/order/version and observation serialization. `businessId=null` is a genuine personal-seller fact only when explicitly captured; missing key, malformed tuple, absent historical row, or erased component is unavailable, never equivalent to personal.
2. **Per inspection order, `ownership_transition_witness`**: initialized exactly once by the first complete forward observation/fact, with a monotonic visit-local generation/irreversible bit. Each later observation compares the locked current fact to the original anchor and sets the witness once when any actual ownership/identity transition occurs. It cannot be cleared, decremented, repinned, or initialized from a legacy/missing fact. Do not compare A’s generation with B’s; each visit has its own anchor.

Automatic public issue requires both A’s pinned original raw ownership fact and B’s effective current fact to be complete/available, equal on the approved ownership tuple, and B’s witness clear. A transition witness permanently invalidates/refuses a new automatic proof even after values restore. A finalized A, null association, and no-proof state still retain/observe the source fact and witness. Consumed links remain usable independently of later A mutation. Existing broad unused-proof invalidation remains in force and separate.

Actual irreversible predicates are only: Listing id/identity (VIN/brand/model/year and normalized identity), seller User, commissioner User, Business association, and the membership identity that makes that publisher binding. A replacement, revoke, delete, or restore of any of these after the anchor sets the witness. Do **not** set it for transient eligibility: User suspension/deletion scheduling when ownership is unchanged, Business active/suspended/recovery status, member role/status-only changes that preserve the same publisher identity, staff/session/assignment/qualification changes, appointment, evidence, pause/relist, price, or ordinary same-owner reobservation/correction. Existing current-authority and unused-proof invalidation checks still gate admission and invalidate already-issued unused proofs; they do not become permanent ownership history.

## Required lock/source matrix

Every writer that can mutate a bound source or cause an order/proof/report write must perform this sequence before any trigger-induced order write:

1. **Discover OLD and NEW targets before deletion/update**: raw ownership facts, public commissioners, sellers, businesses, membership ids/users, Listings, affected orders/reports/proofs. If discovery changes after locking, refuse/retry; never infer from rows after they disappear.
2. Build the complete sorted union and lock exactly once: `User -> Business -> Listing -> inspection_order -> diagnostic_report -> assignment/proof` (each table/id ascending). The User set includes actor, old/new seller, old/new commissioner, membership users, historical recorder/issuer and all users found in affected raw facts. Business includes old/new business. Listing includes old/new Listing. Lock the whole affected order set sorted before multi-row updates; never rely on UPDATE scan order or per-row trigger sorting.
3. Re-read discovery and all source facts under those locks, then perform the mutation and any order/proof/report/audit writes. No code path may acquire order and then User/Business/Listing. A SQL trigger may only write rows after this prefix; callers must be changed because a trigger cannot reorder locks already held.

Apply this prefix to:

| Writer/function | Required change | SQL trigger interaction |
|---|---|---|
| `DiagnosticPublicBindings.lock`, `pairLocks`, `PrismaDiagnosticContinuityProofs` issue/consume, `PrismaDiagnosticReports` comparison/create/finalize | Discover both visits’ OLD/NEW ownership targets; lock full sorted prefix, then orders/reports/proof; revalidate facts, witness, assignments and authority. | Proof/report guards and `diagnostic_public_continuity_atomic` run only after prefix. |
| `PrismaDiagnosticIntake` observation/save | Lock source User/Business/Listing plus order before updating observation; capture authenticated persisted fact and advance witness in same transaction. | Extend raw INSERT guard to require fact bound to locked order/version/current observation and witness state. |
| `PrismaListingRepository.save/update` and listing delete/status/identity writers | Discover affected diagnostic raw facts/orders before Listing mutation; acquire full prefix, then update Listing. | `diagnostic_public_continuity_listing_changed` may invalidate unused proofs and set witness; it must not discover/lock Users after holding Listing. |
| `PrismaAccountDeletionUnitOfWork.scheduleDeletion`, purge/archive and worker `PurgeExpiredAccounts`/`diagnosticAccountErasure` | Before User/membership deletion, discover historical seller/commissioner/recorder/issuer facts and all affected orders; lock full prefix; then redact components and delete membership/archive Listing. | `diagnostic_public_continuity_user_changed` remains invalidation only; no order->User acquisition. |
| `PrismaBusinessRepository.admit/redeem/revoke/changeMember/settings/recover`, and Business status/member writers | Discover old/new member User, Business, Listing facts before locks; lock sorted User union then Business/Listings/orders; revalidate target membership after lock. | Member/business triggers invalidate unused proofs and set witness only for irreversible predicates, not role/status/eligibility alone. |
| `diagnostic_continuity_source_changed` and new ownership-witness trigger/helper | Receive already-serialized source mutation; update witness/unused-proof invalidation with set-based sorted order IDs. | Trigger must never query and lock a historical User/Business/Listing after caller holds a later lock. |

Deadlock argument: all affected transactions acquire the same global prefix, then descend monotonically. A deletion cannot hold User and wait for Listing while a Listing save holds Listing and waits for User; both wait at the User prefix. No order->Listing/User inversion exists. Membership recovery must discover old owner before `locks`, not after Business is held.

## Privacy, SQL and erasure invariants

- Capture only persisted authenticated rows under observation serialization; do not require B’s future publisher eligibility merely to record an otherwise authorized observation.
- Every helper used by INSERT, issue, consume, report creation and atomic audit checks must be boolean and called as `... IS TRUE` / reject with `IS NOT TRUE`; missing, NULL-shaped, malformed, forged, stale generation, wrong raw/order/version, repinned, reset or non-atomic rows refuse.
- Guard initialization and witness reset explicitly. No SQL UNKNOWN bypass, guessed legacy backfill, or hash-only “erasure”.
- Historical third-party purge discovers references through retained raw facts/proof bindings before membership rows disappear. Redact only the affected ownership component: IDs, digests, and restricted proof copies (including consumed copies when personal content is subject to erasure). Preserve unrelated commissioner C’s vehicle observation/raw pin/evidence and preserve B’s consumed report binding, exact retry, ordinary write and release. A consumed link is not retroactively invalidated by A ownership change; current access/publication remains independently gated.
- Post-I/O erasure fencing must re-read redaction state before returning data; worker expiry and repeat runs are idempotent. Retention follows existing classified-data/provenance rights and `DiagnosticArtifactWorker`; if no existing lawful deletion treatment covers the new component, do not invent a TTL/hold—stop that dependent retention behavior for a product decision.
- Keep private admission unchanged; no automatic issuer expansion, no extra permanent refusal, no consent transfer, no copied A report/PDF/evidence, no broader multi-root policy.

## Acceptance matrix and mandatory test-first REDs

Before source edits, establish the preserved HTTP RED at line 796 reaches ordinary issuance (not setup/seed failure). Add test-first REDs through HTTP plus PostgreSQL for:

- unchanged personal and unchanged active Business-member ownership: issue 201, read 200, consume 201, exact retry 201/no duplicate audit; changed proof id 409; anonymous draft 404; independent B release/public read 201/200; raw/report/structured pins/date/mileage unchanged;
- seller, Listing identity/id, commissioner, Business, member replacement/revoke/restore: 403, no proof/report/audit, including mutation→restore with no observation and observation during/after; finalized A, null association, same clock/restored `updatedAt`;
- benign same-owner reobservation/correction, price, pause/relist and eligibility suspension/recovery: remain eligible where current authority permits; no witness and no new permanent refusal. Existing issued unused proofs still invalidate on their existing broad source changes;
- all sources on both A and B, complete raw histories/original pins/supported corrections, missing legacy/erased facts, current leaf; SQL forged/missing/NULL, witness reset/repin, stale version and non-atomic proof/report/audit refusals;
- concurrency: observation/issue/consume/finalization versus seller/member/business/account mutation in both winner orderings; deletion versus Listing save; membership delete/recreate/recovery; two consumers/successors yield one winner, no deadlock/partial audit. Mutation-first denies stale admission; admission-first may complete and later current gates apply;
- erasure of commissioner, historical seller distinct from commissioner/current seller, replaced member, recorder and issuer; component redaction, no personal digest/proof copy, unrelated C survival, consumed B retry/write/release survival, rights expiry, repeat-worker idempotence, stale-read refusal.

Keep all existing real HTTP tests untouched, including negatives and full-v3 reset budgets. The source writer should add only the smallest domain/application seam needed to capture/compare facts; keep SQL enforcement in a new forward migration and Prisma schema/reset manifests. Review generated client/types, indexes on raw fact subjects/order and proof bindings, reset cleanup ordering, and DB migration tests. Do not implement migration/preservation machinery for prelaunch legacy data.

## Minimal assignment and unresolved decision

Bound the implementation to: schema + one forward migration/guards/triggers, the observation and proof/report lock-prefix changes above, component erasure discovery/redaction, and the mandatory test-first REDs/green checks. Do not touch mobile, PDF lineage architecture, protected reset product scope, deployment, Railway, CI polling, or broader automatic issuers.

One dependency must remain explicitly unresolved: the new ownership component’s lawful retention/deletion mapping under existing classified-data/provenance rights. If existing policy cannot name its deletion owner and rights schedule, the writer must not silently retain it or add a new hold/TTL power; pause only that retention-dependent implementation for a founder/product decision. Broader automatic issuer eligibility, multiple roots, and same-visit method-transition policy remain open under ADR-0108.
