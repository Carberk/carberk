# Full-v3 diagnostics public-chain capacity disposition

Docs-only design handoff for #901 under #897 / PR #904. Exact base `bf2dbc57427ac2690804e651a47438ddaa6c9f4d`; reservation branch `agent/issue-901-diagnostics-capacity-20261021` was pushed at that base before edits. This note proposes options only. It approves no allocation, cap, architecture or product change. Root decides.

Inputs: [diagnostics graph plan](full-v3-diagnostics-graph-plan-20261020.md) (ledger and per-operation costs), [accounting rules](full-v3-capacity-inventory-20261020.md#accounting-rules-source-at-base), [auth costs](full-v3-capacity-inventory-20261020.md#authentication-lifecycle-costs-grounded) and the [criterion index](../issue-897/criterion-evidence-index-20261018.md). Fixed: 128 records, 2048 events, 128 deliveries, the joined public correction/template/withdrawal chain, ordinary OTP/TOTP/HTTP grants. This note does not repeat the release audit or re-derive auth behavior.

## Obligation sources: participation versus existence

- **Existence only.** All 15 aliases are bootstrap users in every reservation ([roster](../../../scripts/staging-campaign.mjs#L237), [user insert](../../../scripts/staging-campaign.mjs#L849)), inside the 21 bootstrap records. Existence costs no further records.
- **Required participation (matrix).** [X3](../issue-897/release-acceptance-matrix-20261020.md#L100) names `independent-reviewer (public)` and `private-reviewer (audited self-review)`. [X1](../issue-897/release-acceptance-matrix-20261020.md#L98) names `reception-steward in admin diagnostics`. [S1](../issue-897/release-acceptance-matrix-20261020.md#L41) requires granting "each capability to its matching alias". [Execution order 2](../issue-897/release-acceptance-matrix-20261020.md#L157) requires recording "every required alias/capability". Root's [allocation](full-v3-diagnostics-graph-plan-20261020.md#L9) and its [alias table](full-v3-diagnostics-graph-plan-20261020.md#L18) bind reception/templates to `reception-steward` and the public reviewer to `independent-reviewer`.
- **Governing specification.** The specification requires only a *different qualified reviewer* for public reports and audited self-review for private reports: [feature 50](../../prd/features/50-reports-tier.md#L17), [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md#L18) and [flow 66](../../prd/flows/66-diagnostic-inspection.md#L31). [Feature 40](../../prd/features/40-admin.md#L167) states "One named person may hold multiple explicit grants." No specification names an alias. [Root disposition](full-v3-capacity-inventory-20261020.md#L43) allows S1/S2 to be shown per alias in that alias's group.

As a result, the specification permits reviewer reuse. The matrix's actor naming and root's allocation do not. Any fit therefore needs a root decision on actor mapping. No source or specification change is needed.

## Source facts used

- Grants ([staffPolicy](../../../apps/api/src/modules/identity/domain/staffPolicy.ts#L12), [change](../../../apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts#L25), [trigger](../../../scripts/staging-campaign.mjs#L255)):
  - The actor needs current elevated `staff.manage`, and the target must differ from the actor.
  - `staff.manage` is founder-controlled, so the actor must also hold `founder.control`. Only the coordinator has it.
  - A grant writes 2 records / 2 events. A revoke writes 1 record (audit) / 2 events.
- Review ([DiagnosticReport](../../../apps/api/src/modules/diagnostics/domain/DiagnosticReport.ts#L94)):
  - Separation compares only reviewer and `authorId`.
  - Order capability assignment ([PrismaDiagnosticIntake](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts#L191)) needs reception, a staff grant and a current center qualification. It does not refuse self-assignment.
- Writes per operation ([reports](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts#L105)):
  - Each finding save is one audit record plus a report update.
  - Templates need at least one check ([contract](../../../packages/contracts/src/schemas/diagnostics.ts#L12)). At submit, every panel counts as required ([domain](../../../apps/api/src/modules/diagnostics/domain/DiagnosticReport.ts#L87)).
  - X2's map↔list equivalence therefore needs at least one panel finding on v1, and the correction needs at least one changed finding: **F ≥ 2**. Each required check adds one more. E ≥ 1 comes from the evidence retry.
- Publication ([InspectionOrder](../../../apps/api/src/modules/diagnostics/domain/InspectionOrder.ts#L44)): publication consent on a private order is refused with no write.
- Contact phone: personal publication requires a contact method ([PublishListing](../../../apps/api/src/modules/listings/application/PublishListing.ts#L70)), and bootstrap users have no phone.
  - **C**, the contact proof, is therefore ≥ 2 records (OTP plus confirmation). Confidence is medium; I did not trace the exact write path.
  - The current v3 OTP guard admits only `sign_in` email OTP, so this path is refused today.

## Alternatives evaluated (public reservation only)

- **M: matrix as written.** Coordinator, reception-steward, technician, independent-reviewer, owner and buyer-b; S=6, K=4, G=4.
- **A: coordinator reviews the public report.** Coordinator grants `staff.manage` to the already-elevated reception-steward. Reception-steward grants coordinator `diagnostics.reviewer` and assigns it on the order. Coordinator then revokes reception-steward's `staff.manage`; without the revoke, reception-steward reaches outside its area, contrary to [S2](../issue-897/release-acceptance-matrix-20261020.md#L42). `independent-reviewer` does not participate. Source permits A.
- **B: reception-steward also reviews.** Coordinator grants it `diagnostics.reviewer`. Reception-steward self-assigns the reviewer capability on the order, which source permits and the specification does not address. `independent-reviewer` does not participate.
- **D: independent-reviewer also holds reception and templates in this reservation.** It remains the qualified public reviewer, distinct from the technician author. It self-assigns the reviewer capability on the order and records the public order's publication consent. Reception-steward performs X1 in the private reservation: buyer-a intake, physical consent, duplicate request, and the publication refusal on the private order. The private ledger is unchanged.

| Step (public chain) | Records M | A | B / D | Events M | Events A | Events B/D | Confidence |
|---|---:|---:|---:|---:|---:|---:|---|
| Fixture bootstrap | 21 | 21 | 21 | 21 | 21 | 21 | High (source) |
| Email OTP sign-ins, 2 rec / 4 ev each | 12 | 10 | 10 | 24 | 20 | 20 | High (root-measured) |
| First TOTP, enrollment + 10 backup codes, 11 rec / 13 ev | 44 | 33 | 33 | 52 | 39 | 39 | High |
| Capability grants (+A: `staff.manage` grant + revoke) | 8 | 11 | 8 | 8 | 12 | 8 | High |
| Center + 4 capability qualifications | 5 | 5 | 5 | 5 | 5 | 5 | Medium; bootstrap audit **UNKNOWN**, UNAPPROVED |
| Templates v1, v2 with audits | 4 | 4 | 4 | 4 | 4 | 4 | Medium |
| Owner Listing, 3 `listing_media`, 3 uploads | 7 | 7 | 7 | 7 | 7 | 7 | Medium (floor) |
| Contact proof for personal publication, C | ≥2 | ≥2 | ≥2 | UNKNOWN | UNKNOWN | UNKNOWN | Medium; refused in v3 |
| Public transitions incl. 6 PDFs (plan subtotal) | 28 | 28 | 28 | 60 | 60 | 60 | Medium (source) |
| Finding saves F ≥ 2; evidence intents E ≥ 1 | ≥3 | ≥3 | ≥3 | ≥6 | ≥6 | ≥6 | Medium |
| **Pre-reset total** | **≥134** | **≥124** | **≥121** | **≥187** | **≥174** | **≥170** | |
| Headroom to 128 records | −6 | 4 | 7 | | | | |
| OTP deliveries (of 128) | 6 | 5 | 5 | | | | High |

Event totals exclude contact events. Reset adds at least one event per live row deleted or audit redacted, so at most about 128 more, plus storage-fence, cleanup-intent and lease events, which are **UNKNOWN**. The event cap is not the binding constraint, but reset cost is not yet measured. Accounting excludes three costs:
- Re-elevation: one event; backup-code elevation: two.
- Refresh: one Session event.
- Failed or resend flows: UNKNOWN.

**Lower bound under M.** The three named staff (X1, X2, X3) and the coordinator must each sign in and enroll. The coordinator is the only possible granter: bootstrap grants are fixed and self-grants are refused. That fixes K=4 at 85 auth records. The content floor is 44 records plus F+E ≥ 3 plus C ≥ 2. Moving buyer-b's public mobile read to owner or anonymous web saves 2 records, which still leaves ≥132. Moving return/resubmit (2 records) and PDF retry (UNKNOWN) to the private reservation is already assumed. **M cannot fit 128.** The smallest proven bound is 132 before contact proof and ≥134 with it.

## Disposition (proposal, not approved)

A, B and D all fit by record count. Remaining headroom limits the template: with one panel, v1 can carry at most 4 (A) or 7 (B/D) extra required checks, including any evidence those checks require, before reaching 128. **A is dominated.** It costs 3 more records than B or D, needs a temporary management delegation, makes the coordinator both granter and reviewer, and still leaves `independent-reviewer` without its X3 role. **D is the decisive alternative.** It keeps X3 exactly: `independent-reviewer` is the qualified public reviewer, separate from `technician`, and private audited self-review is unchanged. Its only deviation is that the public order's reception and publication-consent actor is not `reception-steward`. B keeps X1 intact and moves X3 instead.

Decisions root must make:

1. Amend the [allocation](full-v3-diagnostics-graph-plan-20261020.md#L9) and the X1/X3 actor mapping. Choose D, B or A, or confirm M and accept that the public chain cannot run under 128.
2. Decide whether the reviewer's self-assignment of the order reviewer capability (B/D) meets "independent review" policy.
3. Fix template size (checks/panels) within the remaining headroom.
4. Choose where return/resubmit, PDF failure/retry, unassigned-staff denial and buyer-b's public mobile read run.
5. Approve a v3 contact-phone path for the owner's personal Listing, or approve an existing account-phone alternative.

Still UNAPPROVED or open, with no assignment:
- Trusted reservation-aware runtime admission.
- Center/qualification bootstrap authority, provenance, validity and audit cost.
- Disposition of `diagnostic_audits` and snapshots.
- Reservation-aware worker fencing.
- Private-object (evidence/PDF) disposal.

Reinspection is required by [ADR-0104](../../adr/0104-center-diagnostics-with-private-and-public-reports.md#L40), but only domain `reinspect` exists, with no persisted or HTTP path. Its cost (a new order, at least about 20 records) is outside every total above and could remove the remaining headroom.

## Checks

Only this file changed. Offline: `git diff --check`, `pnpm check:agent-docs`, a local link/line existence check, and single-path diff review. No tests, services, staging, GitHub comments, PRs, agents or CI were run.
