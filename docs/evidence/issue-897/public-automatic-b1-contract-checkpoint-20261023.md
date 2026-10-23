# Public automatic B1 contract checkpoint

## Outcome and ownership

B1 is incomplete; public automatic HTTP admission stays CLOSED. No source, schema, migration, fixture or behavioral assertion changes. The approved contract is now durable in [ADR-0109](../../adr/0109-authenticated-ownership-grants-for-automatic-diagnostic-continuity.md), complementing ADR-0108. Founder authorization permits building the grant mechanism, but supplies no actual seller/member consent. This checkpoint does not reopen the settled policy or ask for another approval of it.

- Parent: #897 / #904; implementer branch `agent/issue-897-public-automatic-b1-20261023`.
- Supplied base: `0ca85a6276286278b49333cfa25e0cc99cd93166`, tree `5b9a98cf2b4f83fcef2e5c56dd8be8feb573a4f2`.
- Fresh isolated worktree: `/tmp/carberk-897-b1-20261023-9ebf80f4`. The host scaffold `t3/9ebf80f4` remains unchanged at the supplied base.
- First pushed checkpoint: `4ae9a4ec62442d592d0de259661de96c784d5e6c`, tree `3595f9b5e82a1068cfb573e0c98342e6e5a265bf`. It records the approved ADR and index before any implementation.
- Final checkpoint SHA is supplied in the handoff rather than embedded in its own content.

## ADR collision and approval record

Used `.claude/skills/new-adr/SKILL.md` and its template. Before writing, `node .claude/skills/new-adr/scripts/prepare.mjs "authenticated ownership grants for automatic diagnostic continuity"` selected unused number 0109 and identified semantic neighbors 0103, 0104 and 0108. The selected relationship is complement to 0108. ADR-0108 is byte-for-byte unchanged. The index adds one 0109 entry. Existing unrelated duplicate 0096 numbering is untouched.

The founder's parent approval, reiterated in this dispatch as approval to record and implement without a repeated policy loop, supplies the Decision and Accepted status. No merged ADR is edited. No PR is created. Chief of Staff owns incorporation into PR904 and external execution-state publication.

## Concrete unresolved source contract, identified before implementation

The missing contract is authenticated collection of an actual source grant before either first observation, including its declared authorized end. It is distinct from the now-settled policy authorizing development:

- `packages/contracts/src/schemas/diagnostics.ts:20` accepts only `physical` and `publication` authorization, an arbitrary authority reference and expected order version. Its authorization record has reception attribution/time, but no structured ownership purpose, covered subjects, source-authorized end, or source grant identity.
- `PrismaDiagnosticIntake.authorize`, at `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts:176`, authorizes reception and records that reference. It does not authenticate the grantor as the seller or authorized dealership owner for a classified continuity grant.
- `DiagnosticOwnershipClassificationSchema`, at `packages/contracts/src/schemas/diagnostics.ts:44`, accepts a technician-submitted rights declaration. `DiagnosticOwnershipCapture.append` copies current source subjects and records that technician as `declaredById`. No persisted grant row authenticates a source grantor, subject coverage, or grant provenance. A valid rights-shaped declaration is insufficient evidence of those facts.
- `PrismaPublisherBindings.bind`, in the identity context, establishes current publisher eligibility. It returns a current binding and digest, not an ownership-retention grant. It cannot be reinterpreted as source consent or historical transition history.
- `DiagnosticPublicTransferProof.e2e.spec.ts:403` creates each public visit as seller and records physical/publication references through reception, then observes through technician. It sends no ownership classification and no actual source grant. The automatic positive at line 861 must retain its issuance expectation of 201; neither that assertion nor its setup is changed here.

A follow-on bounded implementation brief must specify the source command and persisted grant binding: authenticated seller/authorized owner admission, covered server-resolved seller/commissioner/member/Listing/vehicle subjects, provenance, explicit source-declared end, revocation/change serialization, and use by the first observation. It must resolve how the current positive obtains a truthful grant through that ordinary authenticated flow. Merely adding invented rights text or an arbitrary fixed date to its technician request is prohibited. This checkpoint proposes no new issuer class or multi-root policy.

## Lock and admission prerequisites

The existing handoff's lock order is retained: complete sorted User -> Business -> Listing -> inspection order -> report -> assignment/proof. OLD, NEW and retained references must be discovered before writes, then revalidated under that complete union. Current implementation does not yet satisfy the full writer contract:

- `DiagnosticPublicBindings.targets/lock` discovers requested orders and current Listing seller/business/commissioner only. It omits retained ownership references and the full affected report/proof/assignment graph.
- Listing update/delete writers do not discover that retained graph before mutation. Account deletion updates User before discovering/removing membership. Business recovery acquires its initial locks before discovering the replaced owner. An order-writing ownership trigger added alone would introduce lock inversions.
- `PublicAutomaticOwnership.ts` already requires both visits' first anchor, complete retained facts and a clear visit-local transition. The schema has classified components but no authenticated immutable first-anchor/witness storage. No backfill or raw-count substitute can establish it.
- `PrismaDiagnosticContinuityProofs.pair` still omits ownership. SQL `diagnostic_continuity_proof_bound` in migration `20261022180000_diagnostic_public_continuity` independently restricts public pairs to `comparative_attestation`. Both remain closed.

Do not implement a broad speculative writer/trigger rewrite from this checkpoint. Parent must complete the bounded grant/source and discovery contract first. Opening automatic admission then requires atomic source facts on BOTH visits, every relevant writer's transition fencing, rights expiry/erasure integration, and matching adapter/domain/SQL checks. Keep temporary eligibility separate, preserve the single structured root restriction and comparative admission, and retain component-only erasure plus consumed retry bindings.

## Root-failure ledger

The read-only mapping `/tmp/public-automatic-403-root-failure-20261023.md` was inspected and its accounting is preserved:

1. Exact positive RED at `0aaff93731cd9b1a5a6c9ab6e76527b236dddda2`, supplied run `39884355600`, API job `120189010381`: expected 201, actual 403.
2. Same root at supplied base `0ca85a6276286278b49333cfa25e0cc99cd93166`, supplied run `39959579692`, API job `120434030280`: expected 201, actual 403 at issuance line 890.
3. Rejected mutable-Listing/history-count shortcut `f0824f32c9821fb2e93b3ae223a00e1a93e6d336`, assembled as `9c7f7a6f`, reverted by `07d328ea67df9864061619559b83f7089bee0553`. Count remains three; this ADR/source inspection is no new repair attempt and does not reset it.

No new HTTP result is claimed. Earlier failures with other causes are not relabeled. Automatic 201, every negative assertion, retention and deletion behavior remain unchanged. No synthetic bypass or database seed is introduced.

## Focused offline verification

- `node scripts/check-agent-docs.mjs`: PASS.
- `node --test scripts/diagnostic-classified-ownership-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs`: PASS, 2 tests. This verifies existing migration/profile bytes and disposal compatibility only, not SQL execution or HTTP admission.
- `git diff --check`: PASS.
- Base comparison confirms only ADR0109, ADR index, and this evidence file change. ADR0108 and all source/tests/schema/migrations retain their original blobs.

Static output is retained in `/tmp/897-b1-9ebf80f4-evidence/ownership-static.log`. No unit runtime is claimed, because no product code changes. No dependency installation, local service, Docker, HTTP/e2e, CI query/dispatch, Railway, reset, deployment, device, emulator, signing, external messages or delegated agent work occurred. No host guard refusal occurred.

## Handoff

Next owner is Chief of Staff for the missing source contract and bounded follow-on dispatch. B1 source implementation, authenticated-grant journey, SQL/race execution, automatic HTTP 201, independent review and exact-candidate acceptance remain unmet. This is a pushed policy/evidence checkpoint, not an implemented vertical slice or release approval.

## Post-decision bounded source contract, recorded before source edits

Founder explicitly dispatches grant collection and first-observation binding as an additional bounded prerequisite. Automatic issue remains closed. Routine transport choice: authenticated `POST orders/:id/ownership-grant` accepts only existing classified rights and returns an opaque grant id; `POST orders/:id/ownership-grant/:grantId/revoke` returns only that id. No grant payload read/list endpoint is added. Observation may explicitly reference `ownershipGrantId`; absent reference preserves ordinary observation and writes unavailable ownership. Legacy technician classification remains accepted for ordinary transport compatibility but cannot alone create available ownership.

One forward grant per order prevents replacement/resurrection. Creation is allowed only before any raw observation, for a public synthetic-admitted non-erased order and the current personal seller or active dealership OWNER. Source Listing/vehicle digest, seller, commissioner, business, commissioner membership, grantor membership, grantor User/Session, declaration time and caller-supplied rights/end are persisted server-side. Existing rights schema enforces service-only use, explicit future end, supplier restrictions and no hold. A session proves creation attribution, not a new indefinite right. At use, current grantor User/owner membership, all bound source subjects and rights are revalidated under the sorted User/Business/Listing/order prefix. A wrong/expired/revoked/changed explicit reference gives generic 403 and rolls back observation/audit/component writes. First raw capture references the persisted grant, copies its exact rights and source binding atomically, and retains observation hash v1. Any earlier unavailable raw prevents later available capture; no backfill or ownership history is invented.

Revoke requires the original authenticated grantor and current seller/owner authority. It erases personal grant content and bound ownership components/affected restricted proof payloads using the existing complete graph disposal protocol, preserving raw/report pins/date/mileage/unrelated evidence and consumed minimum retry binding. Expiry and subject erasure extend the existing `diagnostic_dispose_ownership` worker/purge entry point to discover unconsumed grants as well as bound components, including grantor, seller and commissioner references. No orphan grant rights/session/subject payload remains after disposal. Erased nonpersonal grant id/order marker prevents resurrection; no user deletion FK cascade silently bypasses component/proof disposal. No broad source-writing trigger is added; mutable source transition fencing remains next dependency.

### Accounting and authority correction, appended without removing earlier receipt

Repeated hosted RED observations above are observations, not repair attempts. The parent's three related source iterations are rejected shortcut `f0824f32`/`9c7f7a6f`, reverted `07d328ea`; closed domain contract `b12a3782`; and classified capture `6f17e481`. Not all attempted to open admission. This explicitly authorized post-decision grant prerequisite is an additional bounded work item, not a reset or a fresh root-failure budget. Founder is the ADR decider; Chief of Staff records the decision and is not a separate product authority.

Revocation refinement before its implementation: the original grantor's current authenticated active identity may revoke its retained grant even if the target has since changed or the end has passed. Revocation only removes permission and payload; it does not require the stale target to remain grant-compatible. Creation and capture still require current exact source and seller/owner authority. Erased grants expose no attribution and cannot be resurrected or replaced.

## Source/test delivery after the explicit founder dispatch

This section supersedes the earlier docs-only outcome without removing its history. The bounded grant prerequisite now has source, schema, migration and tests. It does not fix or spend a fresh budget on the automatic-201 root failure. Original iteration SHAs are `b12a3782b5980291b11c71c2f123d95665e6a254` and `6f17e48170b784fb47e1f9e7e6075754e2c87752`, alongside the rejected/reverted shortcut recorded above. Hosted RED repetitions remain observations, not repair attempts. ADR0109 attribution now names Founder as decider and Chief of Staff as recorder only.

### Resulting behavior

- Authenticated `POST /api/v1/diagnostics/orders/:id/ownership-grant` accepts only existing `rights`. It resolves the exact Listing/vehicle digest, seller, commissioner, Business/member and grantor OWNER membership from persisted source under the current/retained sorted prefix. The current Session and active identity are checked. Only a personal seller or current active dealership OWNER may grant. The response contains only `{ id }`, with private/no-store headers; no grant payload reader is introduced.
- The one-per-order immutable grant records grantor/Session attribution, source subject coverage, provenance, supplier constraints and the caller's explicit future end. It cannot be created after any raw observation, replaced, backfilled or resurrected after erasure. Founder approval supplies development authority, never live-user consent.
- `/vehicle` optionally accepts `ownershipGrantId`. A supplied reference must be current, compatible and unexpired, with the exact source/subject tuple and current grantor eligibility. Failed checks produce generic 403 before any observation/audit/component write; the database also fences grant/source/rights races inside the transaction. No reference preserves ordinary observation and records unavailable ownership. A technician classification alone is never permission. An earlier unavailable/erased raw prevents later available capture.
- Available capture references the persisted grant and copies its rights. An optional technician classification may only retain the same purpose/basis/provenance/supplier restrictions with an equal or earlier end. It cannot broaden or extend the grant. The grant's own authorized end and an independently shortened component end remain distinct. Observation hash v1, dates, mileage and report pins are unchanged.
- `POST .../ownership-grant/:grantId/revoke` permits only the original current authenticated grantor. Full retained graph discovery/locking precedes current identity checks and erasure writes; the discovery check itself grants no authority. Revocation remains possible after source changes or expiry because it only removes permission. No replacement or restricted payload read is enabled.
- Migration `20261023120000_diagnostic_ownership_grants` adds the grant table, component FK/index, immutable source/session/rights guards and grant-bound capture guard. Its forward SQL replaces the existing disposal discovery/operation with grant-aware wrappers. Existing worker expiry and `PurgeExpiredAccounts` entry points are unchanged and now include unused grants, historical seller/commissioner/grantor references, all components of selected grants and affected restricted proofs, including consumed payloads. Clearing grants removes all subject/digest/Session/rights/provenance content. Raw/report pins and the minimum consumed report retry binding remain intact. New triggers guard only grants/components; no broad source/order-writing trigger is added.
- Both automatic A/B test visits now obtain real test grants through ordinary authenticated seller requests before observation. All original positive/negative assertions remain, including the required automatic issuance 201. The existing classified capture/deletion tests similarly request real seller/OWNER grants rather than seeding grants or treating technician declarations as source permission. Their assertions are preserved. New HTTP cases exercise wrong actors/roles, forged fields, revocation, changed/wrong-order references and unused-grant expiry/subject disposal.

### Focused offline checks and limits

All final checks below passed. Temporary artifacts are in `/tmp/897-b1-9ebf80f4-evidence/`; `final-commands.json` includes exact final check commands/exits. Dependency setup was `pnpm install --offline --frozen-lockfile`, with no lockfile/package changes.

- `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @auto-tm/db build`: codegen and TypeScript 7 build PASS. The URL is a nonconnecting codegen placeholder; no database or migration execution occurred. The first build without a URL failed at Prisma config loading, then passed with this explicit placeholder.
- `pnpm --filter @auto-tm/contracts build`: PASS.
- `pnpm --filter @auto-tm/api exec vitest run --config /tmp/897-b1-9ebf80f4-evidence/unit.config.mts src/modules/diagnostics/domain/OwnershipGrant.spec.ts src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrant.application.spec.ts src/modules/diagnostics/domain/ContinuityPublicOwnership.spec.ts src/modules/diagnostics/domain/ContinuityPair.spec.ts`: PASS, 49 tests. The temporary config disables globalSetup/setupFiles and excludes e2e/dist/node_modules. Tests use actual intake, authority, bindings and capture with fakes only at database and injected identity ports. The initial RED reached a missing new module import; it is not claimed as an executed assertion failure. The earlier standard-config attempt stopped on unbuilt DB exports before any test or service ran.
- `pnpm --filter @auto-tm/contracts exec vitest run src/schemas/diagnostics-ownership-grants.spec.ts`: PASS, 2 tests.
- `node --test scripts/diagnostic-ownership-grants-schema.test.mjs scripts/diagnostic-classified-ownership-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs`: PASS, 3 tests. These verify exact forward/retained SQL bytes, schema inventory and additive compatibility, not SQL execution. An intermediate profile-registration syntax error was corrected before the final pass; historical inventories/checksums remain unchanged.
- `pnpm --filter @auto-tm/api typecheck`; `pnpm --filter @auto-tm/api exec tsc6 --noEmit`; `pnpm --filter @auto-tm/worker typecheck`; `pnpm --filter @auto-tm/worker exec tsc6 --noEmit`; `pnpm --filter @auto-tm/db exec tsc6 --noEmit`; `pnpm --filter @auto-tm/contracts exec tsc6 --noEmit`: all PASS.
- `pnpm check:runtime-imports`: PASS for built DB/contracts exports.
- `pnpm --filter @auto-tm/api exec eslint` on every changed/new API TypeScript file: PASS after correcting non-null assertions and the fake's type-only import. The exact file arguments are the API paths in the manifest below, excluding CONTEXT.md. No global lint scope was added.
- `node scripts/check-agent-docs.mjs` and `git diff --check`: PASS.

No local services, Docker, HTTP/e2e execution, CI inspection/dispatch, Railway, reset, deployment, emulator/device/signing, extra agent or external message actions occurred. SQL and hosted HTTP/race outcomes remain UNKNOWN. No host guard refusal occurred. Source repair, retry, worker and release caps are unchanged.

### Remaining dependencies

Automatic admission remains deliberately CLOSED. `ContinuityPair.ts`, `PrismaDiagnosticContinuityProofs.ts` and the effective public proof SQL guard are unchanged. The issuance 201 assertion is now at line 897 and is preserved. No HTTP 201 success is claimed.

Next dependency is the database-owned immutable first-anchor/witness protocol on BOTH visits and complete OLD/NEW/retained-reference locking for every relevant source writer. Current exact source compatibility at capture is not proof that values never changed and restored. Adapter/domain/SQL automatic admission must not consume these grants as historical continuity until that protocol exists. Final reviewer independence/dual-inspection proof access, SQL forgery/concurrency/disposal execution, hosted HTTP setup/admission, independent review and exact-candidate acceptance remain parent-owned gates. No real-user grant or real provider activation was performed.

### Exact changed-file manifest for this source checkpoint

- `apps/api/src/modules/diagnostics/CONTEXT.md`
- `apps/api/src/modules/diagnostics/application/testing/ownershipGrantHarness.ts`
- `apps/api/src/modules/diagnostics/domain/OwnershipGrant.spec.ts`
- `apps/api/src/modules/diagnostics/domain/OwnershipGrant.ts`
- `apps/api/src/modules/diagnostics/domain/ports/DiagnosticIntakePort.ts`
- `apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.ts`
- `apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrant.application.spec.ts`
- `apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.ts`
- `apps/api/src/modules/diagnostics/infrastructure/DiagnosticPublicBindings.ts`
- `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticIntakeController.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts`
- `docs/adr/0109-authenticated-ownership-grants-for-automatic-diagnostic-continuity.md`
- `docs/evidence/issue-897/public-automatic-b1-contract-checkpoint-20261023.md`
- `packages/contracts/src/schemas/diagnostics-ownership-grants.spec.ts`
- `packages/contracts/src/schemas/diagnostics.ts`
- `packages/db/prisma/migrations/20261023120000_diagnostic_ownership_grants/migration.sql`
- `packages/db/prisma/schema.prisma`
- `scripts/diagnostic-ownership-grants-schema.test.mjs`
- `scripts/staging-schema.mjs`
- `scripts/testing/retained-schema/20261023120000_diagnostic_ownership_grants.sql`

Current schema SHA-256: `c7bcd721033f6abdd74f38abe4c94f84fc95dfba85d1e06fd5d692ba2f2964fc`.
Forward/retained grant migration SHA-256: `3696e93cfc56f13a95d8e38fd72e3e985d43105ce17ffdf7d5f7ce273efac3df`.


## Source-writer protocol inventory and concrete stop, 2026-10-23

Continuation base and last published source checkpoint: `2ffd715dba96918b50dea97347a061cd792cc190`, tree `7aba836d49a19521e27d332df44419422361c5ca`. This section was recorded before any new source edit. The parent ledger at `/Users/bagtyyar/.t3/worktrees/carberk/t3-e6e4c507/docs/evidence/issue-897/release-blocker-ledger-20261023.md` was read only. Its approved resumption remains effective; this stop does not reopen founder policy or request live consent from the founder.

### Actual writer entry points inspected

Paths below are relative to `apps/api/src/modules/`, except explicitly named worker/database paths. These are the relevant current writers, not a claim that a new protocol is installed.

| Owning source / functions | Mutation and current transaction boundary | Required discovery before writes |
|---|---|---|
| `diagnostics/infrastructure/PrismaDiagnosticIntake.ts`: `create`, `observeVehicle`, `grantOwnership`, `revokeOwnership` | Creates order subjects; observation updates vehicle/association then appends raw/component. Grant/observation use `DiagnosticPublicBindings.lock`; revoke uses disposal discovery. | Current and proposed order tuple, actual grant, all retained raw/component/grant subjects and connected proof/report references. Current single-order/pair discovery does not discover every order reached by a source writer. |
| `listings/infrastructure/PrismaListingRepository.ts`: `save`, `update`, `softDelete`; `listings/application/PublishListing.ts` listing create | `update` writes VIN/brand/model/year and deletion/status. Business authority precedes Listing lock; personal update can reach the Listing write without a User prefix. `save` and publish create new source rows. | OLD and NEW seller/business/identity plus retained references to the Listing, including orders whose current association has moved or become unavailable. Discovery must precede ownership/Listing locks, not run inside the Listing update trigger. |
| `identity/infrastructure/PrismaBusinessRepository.ts`: `redeem`, `changeMember`, `recover` | Redemption may delete sales membership and create an OWNER membership; removal deletes member; recovery deletes outgoing OWNER. `locks` locks actor/explicit target Users then Business. `recover` discovers outgoing OWNER only after Business is locked. | OLD/NEW member identity, both owners/recipient, affected business stock, all retained references to the old membership and connected orders/proofs. `admit` creates Business/invitation; `invite`, `revoke`, `settings` do not themselves replace membership identity. |
| `identity/application/DeleteMe.ts` and `identity/infrastructure/PrismaAccountDeletionUnitOfWork.ts`: `run`, `scheduleDeletion`, `archiveActiveListings` | Session revocation occurs first outside the UoW. Inside it, User UPDATE precedes membership discovery, Business lock, membership deletion, collector lock and later bulk Listing archive. | Entire subject command before the first mutation, including membership identity being deleted, all affected Listings and retained references. Deletion scheduling alone is eligibility; actual member deletion is sticky. Session revocation must retain its existing independent failure/retry behavior. |
| `identity/application/RecoverAccount.ts` and `identity/infrastructure/PrismaAccountRestoreUnitOfWork.ts`: `run`, `republishListingsArchivedByDeletion`, `clearDeletionSchedule` | Collector lock and bulk Listing update precede User update. Callback UoW receives its subject only when each write callback executes. | Whole restore command/subject before collector or Listing lock. Restoration must never restore an erased grant, anchor or membership identity. |
| `identity/infrastructure/PrismaIdentityAdminRepository.ts`: `suspendUser`, `unsuspendUser`; `listings/infrastructure/PrismaListingsAdminRepository.ts`: `transition` | User/session and moderation status writes can invoke existing proof invalidation; moderation may receive a caller-owned transaction. | Outer transaction must participate before any previously held lock/write. Eligibility changes remain distinct from sticky ownership transitions even though they invalidate existing unused proofs. |
| `apps/worker/src/jobs/PurgeExpiredAccounts.ts`: `purgeUser`; `apps/worker/src/jobs/diagnosticAccountErasure.ts`: `diagnosticAccountErasureWrites` | Purge uses an array transaction; ownership disposal runs first, followed by service/video/diagnostic erasure, User/session/member cleanup. Diagnostic erasure also locks Listings/orders/reports. | Union of erasure and source-transition graphs before any deletion, including retained foreign references, not a second backward prefix after disposal writes. Existing disposal's grant-aware graph is a useful input, not a general source-writer entry point. |
| `apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts` and SQL disposal functions | Expire/erase restricted ownership, raw/provenance/evidence and proof payloads; may increment order evidence generation. | Preserve current disposal prefix and all deletion guarantees; any future anchor/witness must be included in discovery and erasure atomically. |
| `identity/infrastructure/PrismaUserRepository.ts`: `delete`, `purgePersonalData` | Repository exposes direct User deletion/personal-data writes; worker currently has its own richer purge implementation. | Do not silently certify these methods as protocol-safe or assume cascading FK writes are covered. A future general source fence must reject an affected unfenced write even if an ordinary route currently does not call it. |

Unrelated writers were distinguished from identity transitions: favorites/views, prices, media/video references, profile photos, contact phones, inventory availability, appointment, qualification, assignment and evidence-generation changes are not ownership history. `PrismaBusinessRepository.changeMember` status-only changes and User/Business suspension are temporary eligibility. Existing unused-proof invalidation for those changes must remain. Listing seller/business are not writable fields of the ordinary `PrismaListingRepository.update` data today, but database source guards still need OLD/NEW coverage for those columns; inventing a transfer endpoint is outside this slice.

Database writers inspected:

- `20261015280000_diagnostic_association_invalidation`: `invalidate_diagnostic_listing_association` is an AFTER Listing row trigger. It updates *all* currently associated orders without first acquiring sorted order locks. It clears the current association but provides no immutable visit transition witness.
- `20261021140000_diagnostic_continuity_proofs`: `diagnostic_continuity_source_changed` updates unused proofs on order/report/raw/evidence/provenance/assignment/qualification/staff/User/Session changes. These writes are part of the retained graph, even when the initiating edit is only eligibility.
- `20261022180000_diagnostic_public_continuity`: `diagnostic_public_continuity_source_changed` runs AFTER Listing/User/Business/member mutations and updates unused public proofs. Its membership matching is not an immutable BOTH-visit witness. Do not repurpose it as one or remove its existing invalidation.
- `20261023120000_diagnostic_ownership_grants`: `diagnostic_ownership_disposal_scope`, `diagnostic_lock_ownership_disposal`, `diagnostic_dispose_ownership_scope` discover and revalidate disposal graph `u/b/l/o/r/p/c`. Their entry parameters are subject/expiry/grant, not OLD/NEW source-write commands. Grant/component guards validate current source, not uninterrupted historical identity. Retained SQL mirrors must remain byte-identical.

### Required implementation contract, not installed

1. Each outer supported writer must declare its complete command subjects before acquiring any prefix lock or mutating a source. Discover OLD, proposed NEW and retained references together. Include current/retained seller, commissioner, grantor, membership and Business subjects; all affected Listings/orders; report predecessor/reinspection edges; proof A/B edges including consumed retry references; assignment and restricted component/grant/anchor records. Do not infer the graph from current source equality or a raw-history count.
2. Acquire one sorted union in the existing class order: User -> Business -> Listing -> inspection order -> report -> assignment -> proof. Source membership is stabilized by its participant User/Business prefix, consistently with existing Identity writers. Discover all order IDs before locking any order. Take module-specific collector/upload/storage-related locks only after the complete required source prefix, with an explicit compatible order for their outer callers. No row-trigger lock discovery after a Listing/User write can supply this guarantee.
3. Re-read OLD/NEW authority, source relations and retained graph under that prefix, including absent/new references. Changed discovery aborts the whole transaction without writes; never expand backward, skip a connected row, use an unsorted bulk update as lock acquisition, or retry with a weakened graph. Revalidate current Session and authenticated grantor authority separately. A fail-closed database fence must also cover SQL/cascade writes that did not enter the coordinator; an application convention alone is insufficient.
4. Atomic first observation establishes one permanent anchor for each order, independently for A and B. It binds the actual first raw ID/hash and compatible real persisted grant/source facts, or records ownership unavailable. No legacy backfill, second-observation repin, grant replacement or erased-anchor resurrection. Later same-visit raw captures cannot become a new first anchor. A report's raw pin and observation hash-v1 remain separate and unchanged.
5. Actual seller, Listing association, vehicle identity, commissioner, Business association, membership deletion/replacement transitions permanently mark the affected visit witness changed under the same complete graph prefix. Changing back cannot clear it. Same-identity role/status eligibility, suspension, scheduling, price/pause/relist and appointment changes do not manufacture sticky ownership transitions. Existing eligibility/proof invalidation still applies. Manual/VIN mixed or corrected pairs remain comparative; a seller transition permanently refuses automatic while independent qualified comparison with fresh evidence/current B authority remains a separate admission path.
6. Grant revocation/expiry/subject erasure must erase affected restricted anchor/witness payloads with ownership components and affected proof payloads, including consumed ones. Preserve opaque minimum retry binding, report/raw pins, date/mileage and unrelated evidence; do not preserve personal tuples in a new history table. Reuse the classified schedule and actual supplied end. Grant authority is never implied by founder policy or technician classification.

### Concrete architecture blocker and bounded disposition

The missing contract is an outer **prepared source command** shared by the affected writers, not an unresolved product decision. Today `AccountDeletionUnitOfWork.run(work)` and `AccountRestoreUnitOfWork.run(work)` expose arbitrary write callbacks without an upfront subject/graph. Recovery's first callback takes the collector lock and writes Listings before its later callback supplies the User write. Deletion writes User before discovering the outgoing membership. Business recovery locks Business before discovering the outgoing owner. Listing AFTER triggers then perform multi-order/proof writes without sorted graph acquisition. Installing a new row trigger or observation helper alone cannot move locks ahead of these already-held locks/writes.

A concrete lock-order risk is visible without running services: restore can hold collector/Listing while awaiting User; deletion can hold User while awaiting collector. Additional witness writes would enter this pre-existing opposite order. No concurrency execution or actual deadlock is claimed. The proof/update scan order and retained graph expansion are additional unproved obligations, not fixed by catching a deadlock or repeating a transaction.

A coherent next implementation needs coordinated outer-UoW/port changes for account deletion/restoration, Business OLD-owner discovery, Listing writers and caller-owned moderation transactions, plus a forward SQL coordinator/fence that incorporates the existing association/proof trigger effects and worker erasure before writes. Its module-specific lock order must include the measurement collector and erasure dependencies. This is the broad source-writer protocol rewrite the dispatch prohibits speculatively installing without a complete lock/source contract. The proposed class order above does not establish that missing cross-context contract. No partial anchor table, transition trigger or historical admission claim was added.

Stopped at this concrete architecture blocker as permitted by the dispatch. No new production source, schema, migration, fixtures, assertions or test timeouts changed. Automatic adapter/domain/SQL admission stays CLOSED and required issuance 201 stays unchanged. This is an inventory/blocker receipt, not completion of the approved protocol prerequisite and not a repair attempt. The earlier three related source iterations and their original classifications remain exactly as recorded above; repeated hosted RED observations do not increase that count or create a new budget.

The parent ledger prohibits publishing a documentation-only checkpoint to trigger CI. Accordingly this receipt is retained locally; no new checkpoint is pushed. Last pushed source remains `2ffd715dba96918b50dea97347a061cd792cc190`. Parent can inspect this exact file in the sole writer's worktree. No new approval loop is requested.

### Inventory-stop verification

- Named existing offline API command from the preceding source receipt: PASS, 4 files / 49 tests (`OwnershipGrant`, `DiagnosticOwnershipGrant.application`, `ContinuityPublicOwnership`, `ContinuityPair`), exit 0. No new tests or implementation were added; this only reconfirms the existing closed contract.
- `node --test scripts/diagnostic-ownership-grants-schema.test.mjs scripts/diagnostic-classified-ownership-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs`: PASS, 3 tests, exit 0. Static schema proof only, no SQL execution.
- `node scripts/check-agent-docs.mjs`: PASS, exit 0. `git diff --check`: PASS, exit 0.
- Byte comparison against continuation base confirms every tracked file except this receipt unchanged, including required HTTP 201 assertion, raw hash-v1 implementation, report pins, original negative assertions and all historical migrations. No new codegen/typecheck is claimed for this docs-only stop.

- `packages/db/prisma/schema.prisma: c7bcd721033f6abdd74f38abe4c94f84fc95dfba85d1e06fd5d692ba2f2964fc unchanged`
- `packages/db/prisma/migrations/20261023120000_diagnostic_ownership_grants/migration.sql: 3696e93cfc56f13a95d8e38fd72e3e985d43105ce17ffdf7d5f7ce273efac3df unchanged`
- `scripts/testing/retained-schema/20261023120000_diagnostic_ownership_grants.sql: 3696e93cfc56f13a95d8e38fd72e3e985d43105ce17ffdf7d5f7ce273efac3df unchanged`
- `docs/adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md: 9df7a8177e71dd1dd79231b2c17ed98662918d243ba01772783c8767947c7359 unchanged`

No SQL, HTTP, concurrency/race, migration-application or hosted negative proof was run. The existing unit fakes do not establish complete database lock coverage, trigger execution or deadlock freedom. No prohibited service, CI, infrastructure, reset, device, agent or integration action occurred. No repair cap or historical attempt accounting changed.
