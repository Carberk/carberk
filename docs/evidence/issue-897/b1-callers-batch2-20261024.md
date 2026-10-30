# B1 caller batch2 stopped at a SQL intent mismatch

Disposition: **BLOCKED_BEFORE_IMPLEMENTATION**. This is a source-inspection stop report, not the requested completed caller checkpoint. Parent owns disposition. No kernel acceptance is revoked or replaced by this writer, and no runtime failure is claimed.

The dispatch expressly requires returning a needed missing SQL semantic to the parent before expanding production SQL. It also requires stopping on a concrete acceptance failure or semantic ambiguity. Those instructions apply here. No new policy interview, reviewer, replacement writer or repair round was started.

## Exact starting state

- Owned checkout: `/Users/bagtyyar/.t3/worktrees/carberk/t3-91df1db4`.
- Initial clean HEAD and preserved scaffold `t3/91df1db4`: `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`.
- Exact accepted source checked out before edits: `d40bab3b11ca4c2a1824798c44a51c3ab7d47767`, tree `ede07f26e07b357087caa615d9a1792384cd9f1f`.
- Unique reservation branch: `agent/897-b1-callers-batch2-20261024`, pushed at that exact source before editing.
- Kernel acceptance record: `/tmp/897-b1-complete-kernel-source-acceptance-20261024.json`, disposition `ACCEPTED_SOURCE_DEPENDENCY_ONLY`.
- Approved design SHA-256 verified as `c15455516d773fe55d5151035b4afceef9348099c60d51578826c38b5eac3725`.
- Exact evidence checkpoint/head/tree/remote/clean results are recorded in `/tmp/897-b1-callers-batch2-20261024-handoff.md` and its final-state JSON. The only committed change is this new report.

Read the approved design and all four overriding architecture corrections, source-correction reassessment/handoff, bootstrap-fixture check/handoff, source acceptance and the current ledger's `currentCheckpoint`. Read repository workflow, run-issue/resume, standards, domain/runtime/worktree/model guidance and the actual relevant exported interfaces, callers and effective parser wrappers. Initial combined overview/report outputs were truncated; this stopped investigation does not claim completion of the full batch's required reading or caller scan. No production editing began.

## Required moderation intent cannot enter the accepted parser

The batch requires `SuspendUser` and `UnsuspendUser` outer preparation and the same receipt asserted by the supplied-transaction Identity adapter. The actual adapter [PrismaIdentityAdminRepository](../../../apps/api/src/modules/identity/infrastructure/PrismaIdentityAdminRepository.ts) updates `User.suspendedAt` at lines24-30 and50-56. Suspension also deletes that User's Sessions at line33 in the same transaction. These behaviors and original errors must survive.

Let K mean `packages/db/prisma/migrations/20261023130000_diagnostic_source_kernel/migration.sql`, P mean `20261024030000_diagnostic_purge_effects/migration.sql`, and I mean `20261024040000_diagnostic_intake_effects/migration.sql` under that same directory.

1. K:119-149 allows direct User UPDATE only through `account_schedule`, `account_restore` or `account_purge`. Neither `session_change` nor `staff_eligibility` admits User UPDATE. I:112-118 is the effective allowlist wrapper. Its special cases concern templates, intake and staff rows; all other operations delegate to K's renamed allowlist.
2. K:208-209 requires the complete protected expected and next User tuples to be equal after removing only `deletionScheduledAt` for both account schedule and restore. A valid suspension necessarily changes `suspendedAt`, so it deterministically reaches `diagnostic_source_account_fields` after otherwise valid normalization and stale checks. Unsuspension has the same problem. The effective registry still includes `suspendedAt`, including P:6's wider User projection.
3. The effective parser I:141-151 delegates both operations unchanged to P's parser. P:551 delegates to the original parser before its additional checks. Neither wrapper removes or relaxes K:208-209. The other special intake/bootstrap paths cannot encode User moderation.
4. `account_purge` is not an alternative eligibility operation. P:554-560 requires exactly its server-derived anonymization intent for one User. Using it for moderation would fail `diagnostic_source_purge_intent` or change the original product behavior. A cutoff or different root does not make it a lawful substitute.
5. Roots alone prove neither a declared write nor its exact effect. Declaring an unchanged User while actually changing `suspendedAt` would violate the exact row-effect guard. Preparing Sessions separately inside the same outer transaction would violate the one-receipt/no-late-prepare contract. No such workaround was implemented.

This is a static counterexample from effective source, not a PostgreSQL execution result. Given an actual normalized tuple S with null `suspendedAt`, set N to S with only `suspendedAt` changed to the existing adapter's timestamp. Then `S - deletionScheduledAt` differs from `N - deletionScheduledAt`, which is precisely the explicit K:209 refusal condition. Reverse the values for unsuspension. No forged tuple or invented receipt is needed to establish the mismatch.

The comment in the later account-effects helper that these finite commands also cover moderation does not change this earlier parser restriction. The mismatch is between required caller behavior and reachable intent, rather than a proposed architecture improvement.

Parent needs to resolve a finite moderation intent that preserves exact User eligibility effects, suspension's actual Session deletions, current proof invalidations, original authorization/errors and one outer receipt. The caller writer is not authorized to add that production SQL semantic in this batch. This report does not prescribe weakening any parser or guard, nor does it authorize a new operation implementation.

## Additional Business admission representation gap

The dispatch requires `PrismaBusinessRepository.admit` to prepare its NEW Business/member slots. The actual [admit implementation](../../../apps/api/src/modules/identity/infrastructure/PrismaBusinessRepository.ts) at lines64-71 creates a NEW Dealership and an owner invitation. It does not create a membership at admission; membership is created later by `redeem`.

K:129 allows `business_eligibility` only for Dealership UPDATE. No branch of K's allowlist permits Dealership INSERT; I's effective wrapper adds none. K:167-168 also requires at least one declared row for ordinary source operations. Thus the exact admission INSERT cannot be declared through any current exported operation. An UPDATE on the absent new Business fails K:196-198, and fabricating a member INSERT that admission never performs violates mandatory final effects and product behavior.

The guard specification intentionally leaves Dealership INSERT ordinary. This report does not call that a guard defect or request activating it. It records the narrower design-to-caller mismatch: the required admission preparation cannot describe the actual NEW Business write using the accepted source-command vocabulary. Parent must disposition the representation, including whether the design's intended entry is an ordinary campaign prelude for this actual invitation-only path. This writer did not silently substitute that interpretation, add a sentinel write, or seed an owner membership.

## Criteria and remaining caller matrix

No batch2 production criterion is complete. This table records remaining ownership, not an asserted complete trigger/FK scan.

| Required group | Actual entry points still required | Evidence still required |
|---|---|---|
| Batch2 account | AccountDeletion/Restore ports and callback fakes; DeleteMe/RecoverAccount; Prisma account UoWs; actually invoked PrismaSessionRepository.deleteAllByUserId in its separate revoke-first transaction | Upfront immutable target/date; prepared graph/collector; same-transaction event audit IDs; locked restore no-op; success, mismatch, rollback, revocation failure and signed-out retry tests; actual-caller SQL scenarios |
| Batch2 Business | PrismaBusinessRepository.admit/redeem/changeMember/recover and activation; necessary invite/revoke/settings campaign preludes | NEW/OLD owner and member negative slots; unlocked discovery then locked policy reread; stock and retained graph; original owner/founder/recipient rules and errors; application and authored SQL coverage. Admission representation needs parent disposition above |
| Batch2 Listing/admin | PrismaListingRepository.save/update/softDelete; PublishListing outer transaction; Ban/UnbanListing and Suspend/UnsuspendUser; PrismaListingsAdminRepository.transition and PrismaIdentityAdminRepository standalone/supplied-tx paths | Exact NEW/OLD tuples and preallocated IDs; same receipt assertions; no late fallback; optimistic conflict/contact/ownership outcomes; moderation parser mismatch above must be resolved |
| Batch2 measurement | PrismaMeasurementStore.bootstrap; packages/db/src/measurement-capture.ts | Authenticated User-before-collector; guest no User lock; explicit collector-before-principal after caller source/upload prefix; unchanged savepoint, best-effort, privacy and timeouts |
| Later group3 diagnostic | PrismaDiagnosticIntake create/authorize/appointment/assign/grantOwnership/revokeOwnership/observeVehicle/publishTemplate; DiagnosticOwnershipCapture, DiagnosticOwnershipGrants, DiagnosticPublicBindings; campaignDiagnosticAdmission and DiagnosticAuthority; PrismaDiagnosticReports; PrismaDiagnosticContinuityProofs including readIn; PrismaDiagnosticIdentityEvidence | Full graph/source/capture/seal/report/proof/material/assignment/admission receipts and rights; both-visit reads and lock order; original unavailable/foreign/retry/security cases |
| Later group2 authority siblings | Session create ordinary campaign prelude and remaining delete/expiry/logout/refresh paths, especially rotateRefreshToken; TOTP completeFirstVerification/consumeBackupCodeAndElevate; PrismaStaffAuthority.change; PrismaUserRepository.delete/purgePersonalData | Finite authority invalidation and exact caller effects; no broadening of Session revocation work into unrelated lifecycle changes |
| Later group5 service/worker | PrismaServiceMessaging.locked/actor/open and campaignServiceAdmission; PurgeExpiredAccounts.purgeUser and diagnostic/service/video account erasure union; DiagnosticArtifactWorker.retireIdentity; ownership/request/material/proof expiry owners | One discovered union before mutations; service actor prefix; attribution-null foreign retained targets; cleanup/fencing/retry minima; actual opposing-order SQL proof. ArtifactWorker integration remains dependent on parent's B5 pin disposition |
| Later groups1/6 fixtures and activation | Remaining ordinary campaign-trigger writer sweep; legitimate DiagnosticPublicTransferProof and e2eSuite setup/mutation/cleanup; supported staff and synthetic-center bootstrap commands; final strict-guard/future-order-shell activation; PublicAutomaticOwnership/domain/adapter/SQL matching admission | Exact supported fixture scopes without seeded consent/anchors, deliberate naked attacks retained; both-visit witnesses and authenticated real seller/current OWNER grants; original automatic HTTP201 and all negative/erasure/retry cases |

The six architecture-audit integration groups remain one finite objective. Batch2's planned6-10 focused hours was not exhausted; implementation stopped during upfront source reading on the explicit SQL-semantic boundary. No revised estimate or new prerequisite batch is invented. Parent owns the semantic disposition and subsequent dispatch within the existing objective.

## Evidence and preservation

- SQL/HTTP/concurrency cases executed: **ZERO**. No test module imported. Existing baseline remains103 declarations /224 authored SQL cases, with no new cases in this report.
- Application tests, builds, codegen, TS7/TS6 and lint were not run. No application code changed, and those checks cannot establish parser reachability on PostgreSQL. No offline PASS is substituted for the missing substantive checkpoint.
- Static audit `/tmp/897-b1-callers-batch2-20261024-static-audit.json` compares every existing tracked blob to d40 and all125 migration/mirror SQL files. All seven kernel migration/mirror pairs remain byte-identical. Exact results are carried in the handoff.
- `git diff --check` and configured `pnpm check:agent-docs` cover this evidence-only edit. Final command results and logs are in the handoff. No product dependency/service changed, so no external documentation lookup was needed.
- The initial static blob audit failed because newline-delimited `git ls-tree` quoted the Unicode seed filename `iž.png`. No product check failed. The corrected audit uses NUL-delimited Git tree entries and object IDs, plus the tracked working diff. Its script and successful output are retained under the same `/tmp/897-b1-callers-batch2-20261024-static-audit` prefix. This correction changes no repository file.
- All production source, SQL/mirrors, schema, source-command boundaries, activation and automatic-closed domain/SQL predicates remain unchanged. B2-B4 tails and all original security/fencing/foreign/deletion/retry assertions are unchanged. B5 pins/modules remain untouched at their supplied disposition `3510963655a90b1389e85a2e6847d6d6bbd4aec0`, single observation UNUSED, cause UNKNOWN, cap exhausted.
- Historical receipts/JSON and original90cc/9f45/40ead/no-code778f,66aaa/38ec/scopedf1/incompletea67/scopedf8/held9efe/correction7725/d40 histories, failures, interruptions and caps remain unchanged. No parent ledger or other checkout was written.
- PR904 was linked through the app, without changing its body/head or creating a PR. Only the unique agent branch was pushed. No reviews, nested agents, integration/published push, merge, CI, SQL, Docker/service, device, deployment, reset/reseed, Railway, operator-bootstrap execution, native build/signing/store or runtime action occurred. No host guard refusal occurred.

Stop after this blocked handoff. Batch2 completion, B1 repair, first-test-candidate readiness, final Standards/Spec, hosted SQL/HTTP/role/profile/race proof and release acceptance remain unclaimed and required.
