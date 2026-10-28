# Diagnostic staff continuity wireframe

## Status and resolved constraints

Draft interaction design for #923/#915 within Milestone A #897, sole integration PR #904. This is a proposed extension of the current `/diagnostics` workspace, not shipped behavior or design approval. Base inspected: `0617c7d094e4ab56e8631458cac258ad31756404`. Independent wireframe UX review and coordinator adjudication must precede hi-fi and production work. No rendered or browser acceptance is claimed.

The [2026-10-29 dispatch](../../../evidence/issue-897/staff-workflow-dispatch-20261029.md) selects this narrow journey. [ADR-0104](../../../adr/0104-center-diagnostics-with-private-and-public-reports.md), [ADR-0108](../../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md), [ADR-0109](../../../adr/0109-authenticated-ownership-grants-for-automatic-diagnostic-continuity.md), [Feature 50](../../features/50-reports-tier.md), [Feature 51](../../features/51-pdf-export.md), and [Flow 66](../../flows/66-diagnostic-inspection.md) govern it. The [approved limited handoff](../../../evidence/issue-897/staff-foundation-disposition-20261022.md#founder-approval-recorded-2026-10-23-utc) settles names and B-only consumption. Older missing-endpoint/frontier packets are historical where current source or accepted ADRs supersede them.

Readiness is sufficient for this wireframe and its independent review. Current server actions and protected proxies exist. This does not certify the whole #923 foundation as shipped, current permissions for any actual actor, or deployed acceptance. No new foundation issue is proposed.

Source anchors, all relative to the repository root:

- `apps/admin/src/app/diagnostics/DiagnosticWorkspace.tsx`, `DiagnosticIntake.tsx`, `DiagnosticAuthoring.tsx`, `DiagnosticBodyMap.tsx`, `actions.ts`, `copy.ts`.
- `apps/admin/src/lib/diagnostic-transport.ts`, `diagnostic-identity-files.ts`, `i18n.tsx`; `apps/admin/src/app/globals.css`; `packages/ui/theme/theme.css`.
- `packages/contracts/src/schemas/diagnostics.ts`, especially identity rights/capture/comparison and predecessor/handoff/request schemas.
- `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts`, especially `prepareRequest`, `requestOutcome`, `executeRequest`, `handoffs`; `PrismaDiagnosticReports.ts` retry and reinspection creation.
- Actual component and network-boundary tests in `DiagnosticWorkspace.spec.tsx`, `identity-transport.spec.ts`, `identity-files.transport.spec.ts`, `request-recovery.transport.spec.ts`. They were read, not run during this source-only design assignment.

Existing neutral borders, native labeled inputs/selects/textarea, section headings, details/summary, fieldsets, status/alert paragraphs, wrapping button rows and locale provider remain the component vocabulary. Keep the current minimum-height controls and visible focus treatment. Resolve exact tokens from source during hi-fi; add no visual system, dashboard redesign, global customer/staff directory, service request capability or marketplace-only access rule.

## Goal, entry and exits

B's assigned technician records B's own physical observation and permitted supporting material. A qualified independent reviewer finds and compares an authorized retained predecessor A, then issues a pair-bound handoff for a currently eligible named B technician. That technician returns to B after reload and starts B's empty linked draft. B is the new physical visit throughout this document; A is the predecessor report, never another customer's entitlement.

Entry stays the existing assigned inspection queue, then **Open inspection** for B. The reviewer enters through their B workspace too. This design does not replace that queue with a directory. Predecessor discovery is a separate B-scoped operation and does not reuse the assigned queue's old cap.

Keep three visible and distinct choices:

| Choice | Placement and result |
|---|---|
| Existing **Start empty report** | In Reports when B has no report. Creates an ordinary unlinked B draft through `diagnosticCreateDraft`. No previous report needed. |
| New **Link this new inspection** | Separate section before Reports. Requires the current approved handoff and creates B's first empty linked draft. Never transforms an already authored ordinary draft. |
| Existing **Create editorial correction** | On an eligible finalized report with reason. Uses `diagnosticCorrect`; retains that visit's original observations/date/mileage. It is not B reinspection. |

Back returns to assigned work. Changing B, report, comparison candidate or leaving with unfinished work requires Save where available, Stay, or Discard local input. Explain that a pending request handle is not saved form input. No hidden navigation because a button is disabled. Preserve existing dirty finding safeguards and extend them to identity input, selected files, rationale and link reason. Locale changes do not count as navigation and never discard input or trigger a mutation.

## Narrow wireframe

English text below is provisional copy, not a locale implementation. Square brackets are existing native controls. Only the authorized role's blocks appear.

```text
/diagnostics                              [existing TK / RU / EN]
Diagnostic inspections
Synthetic inspections only. Real center intake remains closed.
[Back to assigned work] [Load current version]

B: current inspection | audience | appointment | pinned template
< Reception and assignments >              existing controls

1  This visit's identity                    assigned B technician
   Original observation: method, value/reference, date UTC, mileage
   [Record observation]                     existing intake fields
   Retained identity history                read-only original pins
   < Add supporting material >
     Purpose [          ]  Authority/basis [                 ]
     Provenance [       ]  Identifiability [Choose          v]
     Authorized end [   ] UTC  Retention reason [            ]
     Supplier restrictions [                                ]
     Service use only. Staff-only. No caller-supplied hold.
     [Choose image] -> [Upload permitted image] -> verified image
     Kind [Choose v] Location [    ] Value [    ]
     Supporting images [ ] image 1 [ ] image 2
     [Save identity evidence]
   < Correct a recording error >
     Original pin remains visible. Select retained record to correct.
     Complete corrected identifiers + own rights + explanation
     [Append supported correction]

2  Link this new inspection
   New findings, images and publication consent are not copied.

   REVIEWER VIEW
   [Find authorized predecessors]
   date UTC | mileage | report reference       [Compare with B]
   No choices on this page. More pages remain. [Continue search]
   [Start search again]                        bounded fresh scan

   Complete pair comparison
   A, predecessor                    B, current physical visit
   original pinned observation       original pinned observation
   pinned identifiers + images       pinned identifiers + images
   explicit correction chain         explicit correction chain
   original AND corrected values     original AND corrected values
   rights / end / explanation        rights / end / explanation
   [View protected image inline]     [View protected image inline]
   Comparison method [Choose v]
   Required retained support: complete labeled provenance list
   [ ] I reviewed both visits and all required supporting material
   Comparative rationale [                                  ]
   B technician [Choose currently eligible name            v]
   Summary: A report/date/mileage; B date/mileage; chosen technician
   [Issue continuity handoff] [Back to candidates]
   Issued. Current use is checked again for the selected technician.

   SELECTED B TECHNICIAN VIEW, including reload
   [Check handoffs and previous attempts]
   Usable handoff for this inspection         no A fields
   This creates an empty linked draft using B's own observations.
   Link reason for this visit [                             ]
   [Create empty linked draft]
   OR Result recovered                       [Open B draft]

3  Reports and revisions                      existing workspace
   report selector, current authoring, complete findings, body map
   existing vehicle make/model/year review inputs and release controls
```

Desktop keeps the page's existing single flow. Only the authorized full comparison uses two columns with explicit A/B headings. At tablet widths use sequential A then B sections, with the same labeled field order and repeated original/corrected headings. Do not shrink the pair into an unreadable table or put necessary information behind hover. Rationale, technician selection and issuance follow both complete sections. Identity forms use the current wrapping field grids. No new route, modal, wizard or decorative prototype is needed.

## Capture interaction and field binding

Observation stays in current intake, with actual date/time and mileage entered by staff. No fabricated default observation date or copy from A. Every retained raw identity record remains immutable and visible by observation/date/mileage and method. A new recording does not silently replace the report's original pin. Structured recording corrections append a full record with explicit `supersedesId` and explanation, rather than editing or choosing a newer root.

Rights fields start blank. The purpose, basis, provenance, authorized end and schedule reason are staff declarations, not generated permissions. Staff select personal/pseudonymous explicitly. Supplier restrictions permit an explicit empty value where the contract allows it, explained as no restrictions declared, not unbounded rights. `category=vehicle_observation`, `use=[service]`, `schedule.kind=until`, and `hold=null` are fixed transport constraints, explained in text. Staff cannot enter a hold or choose public reuse. Never manufacture a retention duration, source permission or ownership grant from these fields.

Complete and validate rights before enabling the file picker/upload. Local type/size validation accepts JPEG/PNG/WebP up to the current 10 MiB transport bound. Generate the staging ID once per selected file. Stage the declaration first, then PUT bytes only through the current order proxy. Keep the selected File, staging ID, rights and typed identifiers in memory on a recoverable failure. Explicit Retry uploads that same file/ID only after current rights/version review; it cannot rewrite a stale declaration. Cancel drops the local selection, makes no claim of server deletion, and leaves server retention/cleanup with its current owner. Reload requires reselecting a file; there is no browser-persisted protected blob.

Bind structured evidence only to a visible current-server identity record. A selector shows method, observation date/mileage, and original/correction context, never requires a UUID. Identifier rows contain kind, physical location, value, and checked verified-image references. Require at least one verified image per identifier and enforce current schema uniqueness/limits. Rights for the structured record are explicit too; a convenience display may show the file declaration, but must not silently inherit authorization. A correction needs a complete new identifier set, current rights and explanation. Show its superseded original beside it after save. Only server-returned verified provenance can become a checked reference.

This physical-material form is not ADR-0109's authenticated ownership grant. Existing intake `diagnosticIntake(..., 'vehicle', ...)` uses `DiagnosticObservedVehicleSchema`, while the API's extended vehicle request has separate optional ownership classification/grant fields. This wireframe neither fabricates nor backfills them. Any later request to add an ownership-grant capture flow needs its existing source endpoint, actual actor and allowed admin adapter identified by the coordinator. Automatic proof attempts still require genuine retained grants on both visits and server admission; physical/publication consent alone does not qualify them.

## Exact state-to-contract and action table

`actions` below means `apps/admin/src/app/diagnostics/actions.ts`; `D` means the schemas in `packages/contracts/src/schemas/diagnostics.ts`. Machine IDs stay in bindings. References may be read-only orientation text but never copy/paste input requirements. No hash or JSON command editor is designed.

| State / user action | Current contract and binding | Visible result / recovery |
|---|---|---|
| Open B, initial loading | `diagnosticAssigned`, `diagnosticWorkspace`; `D.DiagnosticWorkspaceSchema` plus reports | Keep workspace heading/status; show Loading, no previous B material. Current scoped API remains authority. |
| Record B observation | `diagnosticIntake(B, 'vehicle', input)`; `D.DiagnosticObservedVehicleSchema`; version from current workspace | Show actual raw record after fresh `diagnosticIdentityRecords(B)`. No continuity inferred from VIN/Listing. |
| Read B material | `diagnosticIdentityRecords`, `diagnosticIdentityEvidence`; identity record/evidence schemas | Show retained records and explicit correction edges, not an inferred newest root. Denial clears protected state. |
| Rights ready, select image | `diagnosticStageIdentityProvenance`; `D.DiagnosticIdentityProvenanceStageSchema` | Client-generated stable file ID; content type/size from File, expected order version from fresh B, all rights from explicit form. No bytes before successful staging. |
| Upload/retry | PUT `/diagnostics/orders/B/identity-provenance/file?expectedOrderVersion=…`; octet-stream + `X-Evidence-Type`; `D.DiagnosticIdentityProvenanceSchema` | Only a verified sanitized result is attachable. Failed/lost upload response does not imply verified. Keep same ID/File for explicit retry under current admission. Do not use report-finding upload as fallback. |
| Save material / append correction | `diagnosticAppendIdentityEvidence`; `D.DiagnosticIdentityEvidenceCaptureSchema` | Identity ID from selected raw record; provenance IDs from verified files; full explicit identifiers/rights; correction null or selected retained `supersedesId` plus explanation. Refresh records; original pin remains. |
| Find / continue predecessor scan | `diagnosticPredecessors(B, {cursor?})`; `D.DiagnosticPredecessorPageSchema` | Display only candidate report reference/date/mileage. Retain opaque cursor as returned; no guessed IDs/query. `nextCursor` with zero candidates means Continue search. `exhausted` means this authorized retained scan ended, not no predecessor exists. |
| Select A, compare | `diagnosticReinspectionComparison(B, {predecessorId})`; strict `diagnosticComparisonSchema` in actions | Load full exact pair before enabling issuance. A/B versions, record IDs/hashes, original observation, pinned evidence and explicit corrections come from this response. Never assemble a pair out of unrelated order histories. |
| Open pair image | GET `/diagnostics/orders/B/reinspection-comparison/provenance/file?predecessorId=A`; `diagnosticIdentityFile(..., 'pair')` | Inline protected sanitized WebP with kind/location label. Exact pair query stays attached. No fallback to order proxy, report evidence, public URL or raw storage. |
| Choose B technician | `diagnosticLinkingTechnicians(B)`; `D.DiagnosticLinkingTechniciansSchema` | Native labeled select, name from response and internal userId binding. Empty list explains no currently eligible choice. No UUID entry, reception directory or auto-select first name. |
| Review method / support | `D.DiagnosticContinuityProofIssuanceSchema` | Explicit `comparative_attestation` or request `automatic_normalized_vin` validation; no default continuity assertion. Show all required retained provenance by readable visit/date/location labels. Derive the complete deduplicated provenance ID union from both returned pinned evidence records and their explicit corrections; freeze a deterministic ID order in the command. `facts()` requires exact set equality. No elective subset, omitted contradictory material or client root choice. Review acknowledgment is local only. Rationale typed by reviewer. Server validates full graph, support and method. |
| Issue | `diagnosticPrepareContinuityRequest(B,{kind:'issue'})`, then `diagnosticExecuteContinuityRequest(B,requestId,{kind:'issue',command})` | Prepare only after complete pair/support review. Derive A/B versions and identity IDs from exact fresh pair; linking ID from names; complete provenance union from returned pair; rationale/method from reviewed input. Missing material or a command outside schema limits blocks issuance rather than pruning support. Completion returns historical proof handle. Full proof read, if needed, uses `diagnosticContinuityProof` under dual authority. Never label it usable merely because issuance/read succeeded. |
| B technician opens/reloads | `diagnosticContinuityHandoffs(B,{cursor?})` plus `diagnosticContinuityRequests(B,{cursor?})`; handoffs/requests schemas | Traverse continuation pages independently, including empty pages with cursor. Handoff response alone supplies currently usable proofId and expectedOrderVersion; `result` may supply existing B report. No A comparison/proof read needed. |
| Consume usable B handoff | Prepare kind consume, then execute with `D.DiagnosticContinuityRequestExecuteSchema` | Generate reportId once for this reviewed in-memory command. proofId and expectedOrderVersion come from current usable handoff; reason is technician's own B link reason. Disable duplicate submission. Do not use direct legacy consume as an alternate retry path. |
| Pending/ambiguous execution, same page | `diagnosticRecoverContinuityRequest(B,requestId)` first | Unknown outcome text and Check result action. Completed opens outcome. Pending permits explicit retry of the frozen exact command still in memory, never a hidden repost. Recheck current authority; fresh facts never silently rewrite that command's versions. |
| Full reload, pending input | Discover requests, then recover selected request; `pending_input` contains no command | “This attempt has no saved input. Review current information and enter the input again.” Keep the same requestId, re-enter/review fresh input before explicit execute. This is not exact original command recovery. A concurrent earlier commit can cause changed-command conflict. Show conflict, recover/read current result, never silently create another request or retry DML. |
| Reload, completed issue | Request completion kind issue, `usability:'historical'` | “Issuance recorded. Current use is checked again for the selected technician.” Historical is not permission to consume. Loss of dual authority can deny this read; no B-only fallback to full proof. |
| Reload, completed consume | Request completion kind consume or handoffs `result`; `D.DiagnosticContinuityResultSchema` | **Open B draft** through current workspace/report read. No A fetch, reason, identity, evidence, hash or proof-content read. Current B authority still required. |
| B created, result recovered | `diagnosticWorkspace(B)` and B report schema | Own template, actual B date/mileage, own author, empty findings. Use current `DiagnosticAuthoring`/body map. No A findings, media, consent or access inherited. Never display A details from `successorOf` in B-only handoff. |
| Stale/version conflict | Existing `error:'conflict'`, fixed `DIAGNOSTIC_CONFLICT` transport code | Stop mutation. Keep safe local input in memory, clear/unarm stale comparison and handoff. Load current version, compare/review, recover request outcome. No blind replay with changed version. |
| Denied / authority removed | `error:'denied'` or proxy 401/403 | Clear protected comparison, identity values, previews/object URLs, candidate/technician choices, form text and pending File references. Invalidate async generation. Focus denial heading; no protected cache fallback. |
| Proof no longer available / rights expired / invalidated | Fresh handoff list omits unusable items; actions/proxies return generic refusal/conflict | “No currently usable handoff is available” or generic changed/unavailable state. Do not invent an expiry timestamp or distinguish private refusal causes. Historical proof is not revived, even if source values revert. |
| Empty / insufficient pair material | Empty scoped scan, missing/unavailable complete comparison or generic protected refusal | Explain no usable choice in the current scope; permit fresh search or ordinary empty B report when independently allowed. Never suggest matching text proves continuity. |
| Network error / offline | Existing sanitized error envelope or failed read/fetch | Read failure: Retry read. Any mutation with uncertain outcome: Check result first for durable issue/consume. No offline queue or background replay. Preserve only in-memory input while current authority remains; do not assert work was saved. |

New continuity mutations must preserve these durable request actions rather than using `diagnosticIssueContinuityProof` or `diagnosticConsumeContinuityHandoff` directly as UI shortcuts. Existing direct transports are not removed by this design.

## Recovery and disclosure rules

The coordinator settled pending-input behavior on 2026-10-29 against `diagnostics.ts` request schemas and `PrismaDiagnosticContinuityProofs.prepareRequest/requestOutcome/executeRequest`. The opaque preparation intentionally contains no command. This design adds no browser persistence or API. Exact same-command retry guarantees apply to the command actually retained/submitted, including report ID, expected version, reason, method and ordered provenance. A full reload recovers completed outcomes and request identity, not lost typed text. Re-entry into a pending request needs an explicit review and execution. If an earlier first execute commits after the pending GET, changed input can conflict. Keep that conflict visible and recover current outcome rather than minting a new request to bypass it.

On a lost prepare reply, discover existing request pages before offering another preparation. A found pending handle is not a saved command or evidence that execution started. Request lists expose only the existing kind/state/outcome fields, so label pending entries “Pending issue attempt” or “Pending link attempt” with an ordinal for navigation; do not invent timestamps or author names. Re-entry must not claim to reconstruct a former candidate or command from that handle. Multiple pending handles remain explicit choices.

A B-only handoff shows only “Usable handoff for this inspection” and a visible action. Bind its opaque proof ID internally. With multiple usable rows, local ordinal labels aid keyboard navigation but imply no A identity, chronology, preference or technical eligibility. Do not preselect a row. A completed B result shows B's report action. Reviewer rationale, A customer/commissioner, identifiers, evidence, provenance, hashes and full pair contents never enter that panel, DOM labels, toast, browser persistence or telemetry. B's own typed link reason is separate from the reviewer's rationale. Knowing a handle does not authorize access.

Full comparison needs current independent authority on both visits. ADR-0109 requires the reviewer independent of A's author/reviewer and B's technician; generic reviewer capability alone is insufficient. The server decides eligibility at every read and action. Do not promise automatic eligibility from equal VIN, current Listing/seller equality or an approved manual result. No broader issuer or multiple-root policy is chosen. Contradictions, missing retained material and unverifiable grants cannot be locally overridden or hidden.

Publication remains separate from lineage. Private stays private with the same authorized commissioner policy. Public B needs fresh publication consent, current publisher authority and revalidated association. Physical access, evidence rights, ownership grants, publication permission and public association are separate concepts. The UI must not promise that linking publishes B or lets a later payer access A. Preserve existing review make/model/year inputs and immutable release identity for PDF/reader output. PDF pending/failure never blocks complete authorized reader release. This design changes neither PDF generation nor customer readers.

## Page states and preserved input

| Page state | Structure and focus | Primary next step | Preserved input |
|---|---|---|---|
| Default / ready | Current B summary, identity, role-specific linking, existing Reports | Capture, Compare, Issue or Create linked draft according to current step | Current safe in-memory form only; machine bindings from returned data |
| Loading | Heading plus polite status; region `aria-busy`; old protected pair hidden during new pair load | Wait; read cancellation/back where safe | Same-B local draft stays during a read; switching B requires explicit discard |
| Empty partial page | “No choices on this page. More pages remain.” | Continue search | Loaded authorized rows and opaque cursor; no global count |
| Empty exhausted scan | “No retained predecessor is available in your current search scope.” | Start search again / ordinary empty report if permitted | B form; no inference about inaccessible A |
| Empty handoffs or technicians | Explain no current usable choice | Check current state | B input only; no speculative unavailable actor names |
| Error / upload failure | Inline alert near file/form, error summary link to field | Explicit same-file retry or cancel; recovery first for issue/consume | File/ID and typed input in memory until denied/discarded/reload |
| Offline / unknown outcome | “Connection unavailable. Completion has not been confirmed.” | Check result when connected; no auto-submit | In-memory draft; no saved-input promise |
| Stale / conflict | Alert before controls, mutations unavailable, current/local comparison where safe | Load current version / Check result | Typed safe input for review, never stale proof admission |
| Denied | Replace protected region with denial and safe workspace navigation | Return / re-enter after current authority restoration | No protected material retained in view; locale alone remains |
| Issued historical | Status after issuance, clear technician handoff instruction | Return to B work | Historical handle is not a current-use badge |
| Consumed / recovered | Existing B outcome action, no second Create button | Open B draft | Server-authorized B result, no A lookup |

Use one primary action per current subtask. Preparation/execution is one announced user action with busy feedback and a duplicate-submit fence. Do not steal focus on background reads. On successful append, focus saved-record heading. On comparison load, move focus to pair heading only after the explicit Compare action. Issuance success focuses status; consumption success focuses Open B draft. Returning to candidates restores focus to the selected candidate's Compare control. Changing locale preserves current focused control where practical and announces language through the existing provider.

## Accessibility and locale mapping

Use semantic sections/headings, fieldset/legend for rights, identifiers, method and pair sides; visible labels and associated help/errors. Tab order follows reading order. Native selectors/checkboxes/buttons support keyboard activation. Enter in a textarea never issues proof. Link errors with `aria-describedby`/`aria-invalid`; disabled actions have nearby textual unmet requirements. Announce progress/success through polite status and blocking failure through alert. No meaning depends on color, an icon, an image or a hash. Images have readable kind/location/correction context and equivalent identifier text. Protected previews remain inline and revocable in this workspace rather than opening unmanaged tabs. Preview failure hides bytes and unarms issuance until the full authorized comparison can be reviewed again.

Keep web targets at least 44 px and existing visible focus outlines. At desktop/tablet and 200% zoom, wrap long values/reference text; no page-wide horizontal scroll. Preserve readable field labels under longer RU/TK text. Pair columns collapse in DOM reading order. Do not add animation or a precision-only interaction. Contrast, keyboard and responsive claims still require later actual renders and inspection.

| Copy / data | Existing or proposed binding | Locale behavior |
|---|---|---|
| Page title, loading, retry, refresh, denial, back; observedAt/mileage; reason; create; correction/review notices; make/model/year | Existing `diagnosticCopy` keys and `AdminLocaleProvider` | Reuse current TK/RU/EN strings; do not change component keys on locale switch |
| Date/time and mileage | Existing `AdminDate`/workspace UTC convention; explicit locale number formatting | TK `tk-TM`, RU `ru-RU`, EN `en-GB`; show UTC, keep canonical timestamps/numeric state unchanged |
| Method, kind, identifiability, service-only/hold help, rights field labels and validation | New `identity.*` copy group proposed | All visible labels/help/error/alt/status strings need TK/RU/EN values after wireframe review; no enum token shown as UI copy |
| Original observation / supported correction / recorded explanation | New `identity.original`, `identity.correction`, `identity.correctionHelp` | Original and corrected values visible in every locale; staff-entered values/explanation stay verbatim |
| Find authorized predecessors / Continue search / Start search again / scoped empty and partial-page wording | New `continuity.search`, `continue`, `restart`, `scopeEmpty`, `pageEmpty` | Translate scope precisely; never global “No history exists” |
| Compare with B / predecessor and current visit headings / complete retained support and review acknowledgment | New `continuity.compare`, `prior`, `current`, `support`, `reviewedAll` | A/B labels always include role and date/mileage; date text localized, stored binding unchanged; acknowledgment grants no new authority |
| Method labels | New `continuity.attest`, `automaticRequest`, `methodHelp` | “Comparative attestation”; “Request automatic VIN validation”; explain server admission and rights, never “VIN match confirmed” before proof |
| Eligible technician / no eligible choice / Issue continuity handoff | New `continuity.technician`, `noTechnician`, `issue` | Names returned by server stay verbatim; no translated or fabricated staff name |
| Issuance recorded, current use rechecked / historical | New `continuity.issuedHistorical` | Distinguish historical completion from usable handoff in all three locales |
| Check handoffs and previous attempts / usable B handoff / no current usable handoff | New `continuity.check`, `usable`, `noUsable` | No added A metadata, reason for refusal or fabricated expiry |
| Link reason / Create empty linked draft / Open B draft / no inheritance notice | New `continuity.linkReason`, `createLinked`, `openResult`, `freshWork` | Explain B's own new observations and empty findings, no implied publication or A entitlement |
| Completion unknown / Check result / Retry same reviewed command / pending input / changed-command conflict | New `continuity.unknown`, `recover`, `retryExact`, `inputNotSaved`, `changedCommand` | pending: “This attempt has no saved input. Review current information and enter the input again.” Do not translate it as saved draft, exact restored command or proof admission |

All new English strings are wireframe placeholders flagged for TK/RU/EN hi-fi copy. There is no implicit English fallback acceptance. Locale switching retains rights text, dates, identifiers, correction rationale, selected file, method, technician binding, link reason and in-memory exact command when authority is still current. It never translates staff input, resets proof identity, re-prepares a request or uploads again. Denial clears protected input regardless of locale.

## Review gate and implementation prerequisites

Author assessment is a source-grounded wireframe, not an independent UX score or approval. Independent reviewer must supply usability/discoverability scores, severity 0–4 findings and improvements toward 10. Severity 3–4 findings block hi-fi. Coordinator adjudicates accepted-scope choices; no founder-facing question or approval UI is designed. Product expansion, actual missing permission or a proven missing interface goes to the coordinator with exact source evidence.

Fresh review questions:

1. Can a technician recognize ordinary empty report, editorial correction and linked new visit without mistaking copied observations for fresh work?
2. Are rights and the authorized end clear before any bytes, and are the original pin and full supported correction visible without root-selection shortcuts?
3. Can the reviewer traverse an empty continuation page beyond 50 assignments without a global absence claim, then review the whole authorized pair and select a current named B technician?
4. Is historical issuance unmistakably separate from usable handoff, with no new issuer/ownership/publication powers inferred?
5. Does B-only consumption/reload expose only the current contract, including DOM/accessibility copy and error states, with no A fetch to open a recovered B result?
6. Does pending-input wording accurately distinguish re-entry from exact retry and show a concurrent changed-command conflict without silent new preparation/replay?
7. Are denied/stale/image-failure focus recovery, tablet reading order and locale-preserved forms adequate for keyboard use? Which concrete usability/discoverability scores and severity findings remain?

Next is an independent read-only wireframe UX review on the pinned design commit, followed by coordinator disposition. Then sequential hi-fi/copy work can resolve the current component/token details without redesign. Production remains a separate authorized dispatch with genuine unmet-behavior RED, real components/actions and network-boundary fakes. Required scenarios include rights-before-bytes, original/correction pins, >50/empty-page traversal, dual versus B-only denial, stale versions, expired/invalidated material, reload/lost replies, same-command retry, pending re-entry/concurrent commit, preserved empty B draft, all locales and authority-loss preview clearing. Desktop/tablet browser proof, affected compilers/lint, real multi-actor protected-storage/retention/race acceptance, final Standards/Spec, CI and deployed acceptance remain outstanding. No tests/build/browser/runtime were performed for this document.
