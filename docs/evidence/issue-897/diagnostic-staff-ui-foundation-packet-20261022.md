# Diagnostic staff UI foundation packet

Read-only feasibility inspection against published `070bd66c03a1efc5426f77dc5ee56ca96236e93e`. This extends the [confirmed UI gap](diagnostic-staff-proof-ui-gap-20261022.md) with the actual transport and discovery dependencies. It is not an approved wireframe, a new capability decision, or rendered/browser evidence. The isolated C2 writer owns private comparative policy; this packet changes no product source.

## Facts that change the next assignment

| Existing interface | Verified constraint | Design consequence |
|---|---|---|
| `PrismaDiagnosticIntake.assigned` | Selects the oldest 50 synthetic, unerased orders with an active assignment before per-order authority filtering. No cursor or query is accepted. Retained orders are not excluded by status. | Reusing the queue is not complete predecessor discovery. An authorized predecessor beyond the first 50 can be unreachable. Client filtering cannot fix this. Do not turn a partial/empty page into “no previous inspection exists”. |
| `PrismaDiagnosticIntake.workspace` / `DiagnosticWorkspaceSchema` | Current assignments have User id and capability. Labeled `staffChoices` are populated only for reception-capable actors, from up to 100 qualified center candidates. | An ordinary reviewer cannot rely on this field for a human-readable linking-technician selector. Reusing the reception-wide directory would introduce a new disclosure. Prefer the currently assigned B technicians only, subject to current eligibility. |
| `DiagnosticReportsController` continuity routes | Comparison requires a known predecessor report id. Proof read requires a known proof id. There is no predecessor-candidate or proof-list route. | Reviewer-to-technician handoff cannot be completed after browser reload through current interfaces without manually carrying opaque ids. New bounded server discovery/read projections need acceptance coverage. |
| Existing admin report-evidence proxy | Its path is report/finding scoped; PUT requires `findingId` and report version. | It cannot stand in for order identity provenance or pair-authorized comparison bytes. The new workflow needs distinct current-session order and pair image routes; no raw storage URL or token in browser JavaScript. |
| Identity capture contracts | Rights require purpose, basis, provenance, personal/pseudonymous classification, an authorized end date/reason and supplier restrictions; use is service-only and hold is null. Stage precedes bytes. Structured identifiers refer to verified provenance and an exact raw record. | A generic image picker plus explanation is insufficient. Rights must be recorded before collection. Do not silently create dates, legal bases, consent, holds or new retention policy. |
| Proof issuance contract | Server DTO requires exact pair versions/raw ids, a linking technician, method, rationale and provenance ids. | Derive machine bindings from current server data. Staff should choose the observed pair/material and record the reason, without entering hashes, raw JSON or copied UUIDs. A client must not decide continuity. |

Source entry points: [intake persistence](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts), [report controller](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticReportsController.ts), [contracts](../../../packages/contracts/src/schemas/diagnostics.ts), [admin actions](../../../apps/admin/src/app/diagnostics/actions.ts), [workspace](../../../apps/admin/src/app/diagnostics/DiagnosticWorkspace.tsx), [intake UI](../../../apps/admin/src/app/diagnostics/DiagnosticIntake.tsx), [existing report-evidence proxy](<../../../apps/admin/src/app/diagnostics/evidence/[id]/[file]/route.ts>).

## Recommended interaction boundary for design review

Start in B's assigned inspection workspace. Keep “Start an empty report” separate from “Link a previous inspection”. Capture B's own physical identity and rights-limited material first. Select a retained predecessor through a server-authorized, bounded selection within the actor's existing pair authority. An independently qualified reviewer compares full retained A material and B's own observation, sees original and explicitly corrected records, selects a currently eligible B linking technician and issues the proof. That technician returns to B and selects the currently usable proof to create B's own empty linked draft. Reload and interrupted replies must preserve exact retry identity without duplicating reports or audits.

This is a recommendation for the design phase, not approval of new directory access. A predecessor choice must grant no extra report, commissioner, Listing, image or staff visibility. Private selection must retain the same nonnull commissioner; public selection must retain independent publisher, consent and association checks. No private/public linking. Expired, erased or unauthorized material must not produce partial comparison contents. A pending, revoked or invalidated proof must not appear usable because of a cached card.

Any new discovery projection must define stable bounded traversal or exact scoped lookup, minimal human-readable labels, current server authorization, no-store responses and uniform refusal. It must not expose counts or details of inaccessible pairs. The existing 50-row queue is neither a complete search nor an authority cache. Any staff labels must remain limited to the already relevant current B assignment, not a new general staff directory. Exact schema, paths and implementation seams belong to the subsequent reviewed design/contract task.

## Required behavior and evidence matrix

| Journey/state | Observable acceptance |
|---|---|
| Assigned predecessor outside the first 50 queue rows | Authorized staff can find it through the bounded mechanism; inaccessible visits remain undisclosed. |
| Reviewer without reception capability | Can identify a currently eligible B linking technician through the approved scoped selector; cannot browse unrelated center staff. |
| Fresh physical identity / supported recording correction | User sees original and corrected records, explicit reason and fresh support. Saving a correction never rewrites the released observation. |
| Rights and upload | No byte upload before valid recorded classification; input type/size and chunked-size bounds hold; retries retain the same upload intent. No manufactured retention date or permission. |
| Pair comparison | Complete authorized A/B material, original pins, correction history and protected images; matching VIN/chassis text is never a client-side approval. |
| Distinct reviewer and technician | Reviewer issues; selected current technician consumes. Disallowed self-selection and stale assignments receive current server refusal. |
| Reload / lost reply | Correct actor can rediscover the proof within B and retry the same operation, with one proof consumption, one empty draft and no duplicate audit. |
| Competing change / rights expiry / authority loss | Clear protected comparison and previews on denial; stale input requires fresh current facts rather than silent resubmission; report creation does not use a cached proof. |
| New linked draft | B's date, mileage and template; empty findings and no inherited media/consent; A remains unchanged. Ordinary unlinked creation and same-visit editorial correction remain distinct. |
| Public transfer | Show separate publication readiness; continuity does not imply publisher authority, public consent or valid association. |
| Locale / accessibility / five page states | TK/RU/EN; preserve safe unfinished work through locale changes; keyboard and focus order; loading/empty/error/denied/conflict/retry/consumed states; desktop and tablet readability without color-only cues. |

Real components and actions must render through network-boundary fakes; repository feature components/hooks/actions must not be mocked. API authorization, storage, concurrency, invalidation, retry, erasure and retention need actual disposable-service evidence. Final browser/deployed multi-actor proof must use the implemented workflow. Static source searches and collection are not acceptance.

## Next bounded design assignment

After the single C2 assignment finishes, dispatch the read-only foundation auditor required by [design-grill orchestration](../../../.claude/skills/design-grill/ORCHESTRATION.md). Supply this packet, the gap audit, ADR-0108, Feature50/flow66, current source/contracts and the actual TK/RU/EN copy. Require a READY/DOC_GAP/NEEDS_FOUNDATION verdict, precise missing decisions, authority/disclosure feasibility and a complete decision frontier. Do not spend another writer on an improvised screen.

The following design phases stay sequential: foundation and user decisions, wireframe, independent UX review, hi-fi, independent accessibility/localization/microinteraction review, explicit design approval, then tested implementation. [UI readiness](../../../.claude/skills/run-issue/UI-MODE.md) requires adequate design before nontrivial UI implementation. Root is not the designer or its independent reviewer. No governing PRD, accepted ADR, prototype approval or interface permission was changed here. An additional design PR must not replace PR #904 as the sole implementation integration; reconcile the design delivery route with the founder's integration instruction before starting that phase.

No service, Railway command, reset, deployment, merge, promotion, submission or launch occurred. The three scoped Railway refusals remain terminal. Public-service activation remains closed.
