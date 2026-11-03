# Issue 938 full-coverage repair: lawful-feasibility stop

Release: [6599367078](https://github.com/Carberk/carberk/issues/938#issuecomment-6599367078), recorded in [6599591874](https://github.com/Carberk/carberk/issues/938#issuecomment-6599591874). Writer `issue938-prepared-reader-boundary-r1`, worktree `t3-2d375913`, branch `t3/2d375913`. Input HEAD was `d131c6003e6f…`, tree `711e5218…`.

**Result: STOP before source edits.** 28 of the 56 original cases cannot be represented lawfully within the released paths. The release says: "If any original case cannot be represented lawfully, stop with its exact case name and dependency instead of changing its oracle."

- No helper or e2e bytes changed, so no partial candidate exists.
- No affected checks ran, because no source bytes changed.
- No runtime resources were started. The PG61179/Redis61178/MinIO61180 tuple remains unreserved.

The machine-checked map is in `lawful-feasibility-stop.json`. It covers all 56 inventory IDs, asserted one-to-one against the pinned `case-map.json`. Status counts:

| Status | Count |
|---|---|
| Already implemented by stage 1 (F01, F07, F34, F36, F47) | 5 |
| Representable with an identified lawful producer | 18 |
| Representable, producer unproven at runtime (F19, F26, F35, P07, P09) | 5 |
| Stop: missing lawful producer or helper capability | 24 |
| Stop: Parent equivalence disposition required | 4 |

## Stop cases and exact dependencies

| Dependency | Cases |
|---|---|
| CLOCK: the helper's injected runtime/identity clock is the private `now` (helper:101). Its only mutator is `expireSelectedQualification` (helper:383). | F11, F16, F17, F20, F27, F33, F37, F39, F44, F45, F46, P06 |
| RIGHTS: fixed `preparedReaderRights` until 2027-01-01 for every provenance and evidence (helper:58-62,335,343). That equals every Session expiry (helper:258), so expiry cannot be isolated to A, B, one visit or the proof. | F16, F17, F20, F37, F39, F45, F46 |
| SHARED_PRIVATE_COMMISSIONER: private A and B both use commissionerB (helper:277), and `purgeA` requires commissionerA (helper:423). Lawful A erasure, raw erasure or proof disposal comes only from commissioner purge, which would also erase B. | F08, F14, F15, F30 |
| ISOLATED_REPORT_ERASURE: reports are erased only together with their order (`diagnosticAccountErasure.ts:37,93`). `handoffs()` authorizes the live B order first (`PrismaDiagnosticContinuityProofs.ts:704`), so F08's `body.result` toBeNull is unreachable. | F08 |
| RAW_IMMUTABLE: `diagnostic_identity_record_immutable` (migration 20261029190000:310-331). Raw erasure happens only by purge. | F15, F37, F45 |
| EVIDENCE_GUARD: a disconnected evidence copy is forbidden by `diagnostic_identity_evidence_guard` (20261029190000:434-467). | F45 |
| BUSINESS_GRAPH: the restricted role cannot INSERT `dealerships`/`dealership_members` (helper:179-188). There is no Business owner or member producer. | F04, F05, F06 |
| STAFF_MANAGE_ACTOR: grant revocation needs a staff.manage/founder.control actor (`PrismaStaffAuthority.ts:34-53`), and none is provisioned. | F10, F23, F40 |
| ADMIN_ACTOR: `suspendUser` needs an admin user_eligibility actor (`PrismaIdentityAdminRepository.ts:12-47`). | F41 |
| NULL_DISPLAY_NAME: `updateDisplayName` takes a string. Only purge clears the name. | F43 |
| REVIEWER_QUALIFICATION: the reviewer's deadline is later than the technician's (helper:263-266). A clock advance would also expire the selected technician and change its literal 200 body read to 403. | F11, P06 |
| LATER_ARRIVAL_FENCE: needs a report created after the cursor fence, but the clock is constant and the original writes createdAt directly. | F39 |
| SESSION_EXPIRY_EQUIVALENCE (disposition): the only lawful adapter is Session revocation (`deleteAllByUserId`), not expiry. | F09, F22, F38, P08 |

## Real-PostgreSQL semantics that differ from the memory originals

`diagnostic_continuity_source_changed()` (migration 20261024010000:116-140) has AFTER triggers on users, sessions, staff_grants, center and order assignments, orders, reports, raws, evidence and provenance.

- It invalidates every unconsumed proof bound to a changed source.
- It deletes proofs when bound material is erased.

This supplies lawful producers for F18 and F21, and invalidation-based setups for F26 and F32. It also means any fixture mutation after issuance invalidates the proof.

## Decisions needed (Parent/coordinator)

1. Authorize helper capabilities beyond resource parameterization:
   - explicit clock control;
   - per-visit rights schedules;
   - independent private A/B commissioners;
   - staff.manage and admin actors;
   - a Business owner/member graph with matching restricted-role grants.

   Or move these cases to another test boundary.
2. Decide whether Session revocation is an acceptable equivalent for the four Session-expiry cases.
3. Decide the boundary for F08's isolated B-report erasure, F15/F45's raw mutations, F45's disconnected evidence and F43's unnamed user. These have no production producer at all.

Helper resource parameterization (stage-1 literals at helper:51,160-162) is independently representable, but it was not started so as not to produce a partial candidate. This is not a #938, full-coverage or Milestone A PASS.
