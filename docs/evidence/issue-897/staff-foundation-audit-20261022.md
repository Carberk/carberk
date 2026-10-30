# Diagnostic staff identity and reinspection foundation audit

Date: 2026-10-22. First independent foundation audit for founder-selected release #897 and sole implementation integration PR https://github.com/Carberk/carberk/pull/904. Terminal status: NEEDS_FOUNDATION.

## Audit boundary and exact candidate

Inspected clean host-owned checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-bbec7bdf`:

- Commit `9f2b0bfd862a8ef2f8b28aaeb02217e91d4615fe`.
- Tree `765a5f9abd7258a6a4fc767b0ac58a8d9c5e0dae`.
- Supplied parent branch attribution: `agent/release897-resume-assembly-20261021`. This report establishes commit/tree identity, not branch ownership.
- Live bounded PR read reports published #904 head `070bd66c03a1efc5426f77dc5ee56ca96236e93e`, draft, auto-merge false. It is a different candidate. Its API and aggregate PR checks report FAILURE in this snapshot; this audit does not diagnose those failures or transfer them to the local candidate.

Runtime injection identifies Codex `gpt-6.1-sol`, medium reasoning. Live host catalog identifies inherited provider `codex_work`, inherited model `gpt-6.1-sol`, runtime `full-access`, interaction mode `default`. Its model options expose reasoning low/medium/high/xhigh/max/ultra and serviceTier default = Standard or priority = Fast; catalog currentValue is low for reasoning and default for serviceTier. The catalog's low differs from the injected medium runtime identity. I changed no control and cannot attest process-level service tier from a separate execution receipt. No quota was probed. One auditor, no children.

Only repository reads, bounded GitHub reads, host capability metadata and PR registration were used. The T3-required link of #904 updates thread metadata, not GitHub content; the thread link was verified. No tests, hooks, installs, services, HTTP acceptance, browser/device, Railway, reset, deployment, credentials, CI mutation, source/spec/copy changes, commit, push, issue or comment creation occurred. The sole written artifact is this report. This is neither a Standards/Spec review nor rendered acceptance.

Read AGENTS.md, CONTEXT-MAP.md, owning API/diagnostics/admin/contracts/UI overviews, coding workflow, domain and coding standards, worktree and GitHub guidance, UI-MODE, and design-grill SKILL/ORCHESTRATION/FOUNDATION/DELIVERY. Applied the required unslop writing guidance. The two supplied packets were treated as leads and checked against the supplied source.

## Verdict and authority

NEEDS_FOUNDATION under `.claude/skills/design-grill/FOUNDATION.md:11-38`: prerequisite discovery, current usability and handoff behavior must exist before a usable end-to-end wireframe can be finalized. This is not a missing color token or general UI library. The assigned queue and known-ID endpoints do not supply that behavior. DOC_GAP describes the remaining permission/product frontier below, but is not the overall verdict. READY would falsely imply those prerequisites exist. NOT_UI and ALREADY_DESIGNED do not apply.

ADR-0108 is accepted founder authority, not an open proposal. It already settles immutable per-visit evidence, explicit supported corrections, same-vehicle comparative attestation by a qualified reviewer independently assigned to A and B and distinct from B's linking technician, single-use pair proof, empty new B report, current rechecks, invalidation, exact consumption retry, minimum disclosure and rights lifecycle. Do not ask for that decision again. See `docs/adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md:14-53` and `docs/prd/features/50-reports-tier.md:106-110,141-147`.

ADR-0104:14-28 and :38-40 establishes scoped staff, original audiences, TK/RU/EN, immutable releases and enforceable classified retention. Feature40:89-93,125,165-171 explicitly includes diagnostic correction/reinspection and localized staff work. Flow66:98-106 reconciles the pair-proof journey; its old “Proposed / Not implemented or scheduled” header at :3 is not implementation truth or a release exclusion. Feature50's older implementation-orientation text at :135-139 also does not override source.

GitHub reads: #907 requires current scoped staff intake and TK/RU/EN responsive states; #914 requires real authoring/evidence and protected retry/resume, and its original body excludes final reinspection/release; #915 explicitly owns correction/reinspection/review responsive UI and tests, depending on #914/#907/#900/#906. ADR-0108:12 subsequently assigns proof implementation to #914 within #897. Root must preserve that cross-slice ownership rather than treating #914's original exclusion as removal of #915's selected acceptance. #897's founder release-priority section requires the whole campaign plus marketplace, with final acceptance, restoration and signed Android evidence; promotion and store submission remain separate. No issue closure is justified here.

Canonical terms are Inspection Order, Inspection Report, Checklist Version, Report Snapshot, Diagnostic Visit Identity Record and Diagnostic Continuity Proof, `docs/domain/GLOSSARY.md:165-199`. Glossary definitions are not translated interface copy.

## Current screens, target journey and platforms

The staff platform is responsive admin web at `/diagnostics`, desktop and tablet. `apps/admin/src/app/diagnostics/page.tsx:1-8` uses current staff entry and shared navigation. It does not grant marketplace-admin authority to diagnostics staff. Mobile/public report readers are neighboring customer surfaces, not an alternative staff workflow. This assignment requires no new mobile staff screen; downstream reader lineage and native acceptance remain campaign obligations.

Current source facts:

- `DiagnosticWorkspace.tsx:5-9,16-30,34-45` loads assigned work, selected order context and reports; runs ordinary authoring and report transitions; clears protected state on denial. Queue rows and report/staff fields currently display opaque IDs at :36,39,41. Those existing displays do not authorize an ID-entry workflow for the new task.
- `DiagnosticIntake.tsx:13-21` handles reception authorization/appointment/assignment plus technician date, mileage and VIN/manual observation. Its manual decision reference is not classified structured identity capture.
- `DiagnosticWorkspace.tsx:40` starts an ordinary empty draft with generated reportId and current order version. :46-53 supports review, withdrawal and same-visit editorial correction and displays an explanation about a new physical visit. It does not perform proof issuance or proof consumption. Its operation keys are refs at :17, not durable browser-reload recovery.
- `actions.ts:16-32` is the complete diagnostic action export boundary: assigned/workspace/intake, ordinary draft, findings, transition, correction and report-evidence abandonment. No raw identity-history, classified provenance/evidence, pair comparison, proof discovery/issuance/read or proof-bearing reinspection action exists. Searches of admin sources found no alternate staff implementation.

Target behavior already authorized: B technician records B's fresh physical identity, rights-limited material and any explicit supported correction without rewriting originals. An independently pair-authorized reviewer finds retained A, reads the full authorized comparison and protected images, identifies an eligible current B technician, records rationale and issues an exact server-bound proof. That distinct technician returns to B, discovers a currently usable handoff and creates B's own empty linked draft. Loading, empty, error, denial, conflict, upload interruption, lost reply, invalidation, consumption and reload must remain understandable in TK/RU/EN. Ordinary unlinked creation and same-visit editorial correction stay separately intelligible. Public publication readiness is distinct from continuity. No screen may determine continuity from equal text or ask staff to paste hashes, JSON, proof UUIDs or raw record UUIDs.

## Direct transport findings and prerequisite contract

**Assigned work is not complete predecessor discovery.** `PrismaDiagnosticIntake.ts:96-105` selects oldest synthetic unerased orders having an unrevoked assignment, orders by createdAt/id and takes 50, then performs current per-order authorization. There is no query/cursor input. Retained orders are not excluded by status. An accessible predecessor after row 50 is unreachable through this mechanism; unauthorized older rows can occupy the cap. A partial empty page cannot mean no previous inspection exists. `DiagnosticIntakeController.ts` exposes assigned and known-order reads, not a predecessor search.

Minimum replacement: B-scoped discovery over retained eligible A reports within the actor's current independent authority on both orders, same-audience/commissioner restrictions and current material rules. It needs bounded stable traversal or an equally complete scoped lookup using recognizable staff information, with explicit continuation semantics. Apply current authorization before returned data and prevent protected totals, match counts, timing/details in refusal or false “none exists” claims. Do not add a global report, customer, Listing or VIN directory. Cursor shape, query paths, indexing and page size are engineering choices once the disclosure boundary is approved.

**The labeled staff directory is reception-only.** `PrismaDiagnosticIntake.ts:108-131` returns assignment userId/capability, but `staffChoices` is populated only for reception, from up to 100 center candidates. A reviewer without reception receives no labeled choices. The current displayName fallback can even be a UUID. `packages/contracts/src/schemas/diagnostics.ts:128-134` adds no independent reviewer directory grant. Minimum requirement is only current eligible B linking technicians, with useful human-readable labels, current assignment/qualification/grant checks and exclusion of the issuing reviewer. Exact label disclosure needs the frontier decision below; do not expose reception's wider directory.

**Known IDs do not complete selection or recovery.** `DiagnosticReportsController.ts:56-69` requires predecessorId for comparison and proofId for proof read; there is no candidate/proof-list route. `PrismaDiagnosticReports.ts:83-121` independently authorizes both orders and supplies immutable A pins and B's current observation/evidence. `PrismaDiagnosticIdentityEvidence.ts:235-259` returns the selected explicit correction component, ancestors and descendants, not every disconnected root. Full retained comparison means all material required for the authorized selected comparison, original pins, explicit corrections and provenance, with contradictory/disconnected claims refusing under policy. It must not be relabeled as a complete global identity history or conceal disconnected claims as “clean”.

Minimum requirement: B-scoped predecessor selection plus a server-derived handoff/proof projection, fresh status and an authorized retry/result lookup. Bind exact machine identifiers and versions internally. Do not infer readiness from successful historical proof read.

**Read authority and consume authority differ.** `PrismaDiagnosticContinuityProofs.ts:237-268` requires current staff authority on A and B to read proof contents. It deliberately permits historical reads after invalidation (:256-257). The DTO at `diagnostics.ts:97` contains no invalidatedAt, consumed state, current eligibility or rights-end status. Consumption at `PrismaDiagnosticContinuityProofs.ts:183-228` rechecks issuer authority on both orders, while the linking technician needs their own current B technician authority. It need not grant that technician A access. Thus simply wiring the existing proof GET cannot support every authorized B consumer and cannot distinguish readable history from usable proof. A B-only minimal task projection is a distinct disclosure contract, not permission to return restricted pair contents.

**Issuance retry is not yet exact replay.** Issuance input `diagnostics.ts:96` has no operation ID; `PrismaDiagnosticContinuityProofs.ts:129-165` creates a fresh runtime proof ID and issuance audit per admitted invocation. Exact consumed-report retry exists separately at :174-181. A lost issuance reply cannot safely be handled by blindly reposting. Foundation must provide deterministic authorized result recovery and/or durable idempotency, plus stable consumption request identity and result recovery across reload. Choice of persistence/key implementation is engineering work, not a new founder decision. Do not persist protected pair content or bearer tokens into an ad hoc client cache.

**Report evidence cannot proxy identity material.** `apps/admin/src/app/diagnostics/evidence/[id]/[file]/route.ts:9-27` forwards `/reports/:id/evidence/:file`; PUT requires findingId and expectedVersion, validates MIME/size/origin and bounds streamed bytes. It cannot be repurposed by changing a label. Order identity stage/upload/read and pair-comparison provenance endpoints already exist at `DiagnosticReportsController.ts:73-99`, with private/no-store headers before validation. Admin needs distinct current-session order/pair proxies and actions. Keep browser API credentials server-side, enforce streamed limits, do not return storage locators, and reauthorize protected bytes. `PrismaDiagnosticIdentityEvidence.ts:126-145` already reauthorizes after storage I/O; preserve it.

**Rights precede bytes.** `diagnostics.ts:34-52` requires purpose, basis, provenance, personal/pseudonymous classification, service-only use, authorized end date and reason, supplier restrictions and null hold; identifiers bind verified provenance and exact raw record. `PrismaDiagnosticIdentityEvidence.ts:63-80,94-123,179-226` stages classification first, uses bounded durable upload intent and explicit supported corrections with fresh evidence. Wireframes may require these inputs and explain missing authority. They may not invent legal basis, consent, retention dates, a TTL, a hold power or collection permission. The authorized source supplies actual rights values. Missing rights means no collection, even for prelaunch production-like data. Synthetic fixtures do not grant real collection rights.

## Current policy and evidence limits

Source supports the bounded same-commissioner private manual/manual, VIN/VIN and uncorrected mixed comparisons, supported same-method corrections and unchanged normalized-VIN automatic path. Corrected mixed remains denied at `domain/PrivateContinuityAttestation.ts:24-30`; full VIN graph checks appear at :68-84 and automatic unchanged-single-root checks at :89-96. Public proof issuance is blocked by `PrismaDiagnosticContinuityProofs.ts:72-75,148`; automatic uses the same qualified distinct dual-assigned reviewer at :135-145. The temporary proofless public path is explicitly separate in `DiagnosticReportsController.ts:48-53` and does not complete ADR-0108 transfer authority.

Read-only test corroboration: `PrivateContinuityAttestation.spec.ts:34-71,88-115` exercises automatic rights/history/root restrictions and uncorrected mixed directions. `PrivateContinuityVinCorrection.spec.ts:36-106` exercises C2, explicit graph/pin ordering, full-chain rights, contradictions and corrected automatic/mixed refusal. The older mixed-suite title at :115 is scoped to that suite; it does not override the newer VIN/VIN policy and dedicated tests. No tests were executed by this auditor.

Local C2 source evidence is domain GREEN79, not HTTP GREEN: `docs/evidence/issue-897/vin-correction-assembly-20261022.md:5-11,17-28,38-40` records fresh domain79, cached aggregate checks, import-only collection and C2/P1/new-negative HTTP UNKNOWN. I did not rerun or independently validate those logs. Current source corroborates the described policy, not runtime acceptance. Corrected mixed, public transfer/current publisher authority and broader automatic issuer/multiple-root eligibility remain unfinished selected obligations. The foundation issue below does not silently remove them from release #897.

Disposable prelaunch data does not remove isolation, erasure, retention, worker cleanup or rights requirements. Staging/production resets require their existing inventory, reproducibility, preserved infrastructure/configuration/signing and producer/storage exclusion prerequisites. The three scoped Railway refusals are terminal. No retry or bypass is proposed. Software acceptance, real-center activation, production promotion, store submission and public launch are separate gates.

## Existing design and actual copy

Search of `docs/prd/ui/wireframes/` and `docs/prd/ui/hifi/` found mobile listing/auth/navigation/services artifacts, no diagnostic staff identity/proof workflow. No approved diagnostic wireframe/hi-fi was found. `docs/prd/ui/service-workspace.md:3-5,19-35` supplies responsive staff, accessibility, localization and recovery principles for service work, not authority or interaction design for pair proofs. The historical campaign prototype linked by ADR-0104:45 is not proof of current identity/reinspection design approval. Contracts and passing DTO tests establish no design approval.

Actual localized copy is `apps/admin/src/app/diagnostics/copy.ts:3` EN, :6 RU, :9 TK. Examples, quoted exactly:

| Key | EN | RU | TK |
|---|---|---|---|
| queue | Assigned inspections | Назначенные осмотры | Bellenen barlaglar |
| create | Start empty report | Начать пустой отчёт | Boş hasabaty başlat |
| manualReference | Manual decision reference | Основание ручного решения | El bilen çözgüdiň salgysy |
| history | Linked previous report | Связанный предыдущий отчёт | Bagly öňki hasabat |
| empty | No currently authorized assigned inspections. | Нет назначенных осмотров с текущим доступом. | Häzirki girişli bellenen barlag ýok. |

The existing EN newInspection says “New physical inspection starts empty under current intake and template. Do not copy old findings as current observations.” RU says “Новый физический осмотр начинается пустым по текущему шаблону. Старые находки нельзя выдавать за новые наблюдения.” TK says “Täze fiziki barlag häzirki nusga bilen boş başlanýar. Öňki netijeleri täze gözegçilik hökmünde göçürmäň.” These explain existing semantics; they are not a linking control. Current rights classification, pair attestation and proof recovery copy is absent. Design must author and review TK/RU/EN including longer translations and native-review markers rather than translating glossary definitions.

Usable primitives exist: `packages/ui/components/Button.tsx:6-35,42-48`, `Input.tsx:5-19`, shared theme and tokens. Admin imports the shared web theme and defines light/dark overrides in `apps/admin/src/app/globals.css`; current diagnostic controls use inline neutral classes and minimum height at `DiagnosticWorkspace.tsx:13` and `DiagnosticIntake.tsx:10-12`. `packages/ui/tokens/motion.ts:8-18` owns durations/easings. Resolve actual token values and app overrides during hi-fi; no reusable component/token prerequisite was established. `apps/admin/src/lib/i18n.tsx:7-24` owns root locale, document language and locale cookie. Do not remount safe unfinished work on a language switch.

## Mandatory prerequisites versus design work under existing authority

Before final wireframes: settle the permission frontier below, specify and ship the single bounded discovery/handoff/current-status contract, named eligible B technician projection, reliable lost-reply/reload recovery and identity/pair proxy behavior with acceptance evidence. FOUNDATION.md:13 says a prerequisite behavior “must ship first”; SKILL.md's foundation gate says NEEDS_FOUNDATION must “stop until it ships.” This report does not authorize visual design or UI implementation. No child work remains running.

Existing authority already permits the designers, after that gate, to design the capture sequence, original/corrected history, full retained selected-pair comparison, reviewer attestation, distinct technician consumption, separation of unlinked report/editorial correction/reinspection, and safe refusal/recovery. It also settles no inherited findings/media/consent, no client continuity decision, current rights before bytes and privacy-safe states. No founder decision is needed for endpoint spelling, component composition, cursor encoding, layout, keyboard/focus order, responsive evidence reading or translation review. Those belong to contract implementation and the sequential wireframe/UX/hi-fi/accessibility review loop. Wireframes must account for base loading/empty/error/populated states plus denied/conflict/retry/invalidated/consumed boundaries, locale changes, interrupted uploads, lost replies, revoked assignments and complete protected-content clearing.

A finalized design cannot claim public transfer readiness until its current publisher-authority prerequisite exists. It may specify already mandated fresh consent, revalidated association and clear refusal states without choosing the missing issuer or publisher principal policy. Broader automatic issuer and multiple-root admission must not be invented in controls or used to bypass independent review.

## One complete unresolved decision frontier

1. **Approve the minimum staff disclosure and B-only handoff boundary.** Recommend predecessor candidates only for current independent A/B authority, recognizable labels drawn from already authorized inspection facts, and a named eligible selector limited to current B technicians. For a selected B technician without A authority, recommend only a B-owned actionable handoff/result projection, with internal opaque bindings, current readiness and their own resulting report, excluding A identity, commissioner, rationale, provenance, hashes and pair contents. Keep full comparison/proof history dual-authorized. Evidence: ADR-0108:24,41,49-51; intake :112-131; proof read :237-268 versus consume :183-200. Existing authority settles pair privacy and consumption, but does not explicitly settle this new B-only read or exact staff-label disclosure. Consequence: approving it permits a usable least-disclosure handoff; requiring dual assignment for every consumer instead would add a staffing restriction and needs explicit choice. Neither a broad staff directory nor raw UUID handoff is an acceptable implicit resolution. Root should record the approved disclosure contract before the prerequisite writer starts; a material access-policy extension needs the repository ADR process.
2. **Settle the current public publisher-authority resolution contract for transfer.** ADR-0108 already approves transfer with fresh B publication consent and revalidated association. Do not reopen whether transfer is allowed. Recommend an authoritative current public principal/authority check at admission and publication, separate from historical commissioner, payment, physical access and proof issuance. Evidence: ADR-0108:28-35,39-43; Feature50:108; proof implementation's private-only predicate. Consequence: the authoritative principal lookup/recording and its staff recovery interaction must be settled before public transfer can be delivered; a private-only first checkpoint cannot close the selected public obligation. Do not infer new publisher power from the current commissioner field or choose the public principal model in UI.
3. **Settle automatic proof issuer eligibility beyond the existing reviewer subset.** Recommend retaining the current distinct qualified dual-assigned reviewer subset while the founder explicitly decides whether any technician/self/background issuer is ever admitted, with its current-session/authority/audit rules. Evidence: ADR-0108:22,24,39-43 identifies automatic method/actor but does not enumerate a wider issuer grant; source :135-145 and diagnostics overview explicitly leave broader eligibility unresolved. Consequence: no automatic self-approval or background button may be designed from the DTO enum. Existing bounded automatic behavior can be represented honestly; broader policy remains open rather than deemed unnecessary because current tests pass.
4. **Settle automatic handling of multiple retained roots.** Recommend continuing refusal unless complete retained evidence can be accounted for under an explicit approved consistency/eligibility rule. Evidence: `PrivateContinuityAttestation.ts:89-96` and `PrismaDiagnosticContinuityProofs.ts:95-100` enforce exactly one root; ADR-0108 requires consistent evidence but does not define multiple-root automatic eligibility. Consequence: designer shows honest ineligibility/review recovery and never chooses the newest root or drops conflicting history. Founder must decide the expanded policy or explicitly accept its bounded disposition for release; the auditor does not resolve it.

No additional rights periods, retention defaults, legal bases, center activation decisions or mandatory notification channel are proposed. Authorized rights values must be supplied, not chosen by a designer. Corrected mixed support is an approved implementation gap, not another product decision.

## Exactly one prerequisite issue preview, not created

Recommended title: `Establish bounded diagnostic predecessor discovery and staff proof handoff for #897`.

Recommended existing labels: `api`, `admin`, `feature`, `blocked`. These labels were observed on the selected diagnostic issues. Do not add `ready-for-agent` until the applicable frontier and contract are settled. Proposed dependency update, only after approval: #915's missing staff reinspection journey depends on this prerequisite; coordinate #914's identity/proof ownership and #907/#900/#906 foundations. Keep #897 as parent and #904 as the sole integration. No GitHub mutation was performed.

Draft body:

```markdown
## Summary

Supply the bounded discovery, current-authority projections and recoverable proof handoff required by the selected diagnostic staff identity/reinspection workflow in #897. The oldest-50 assigned queue and known-ID comparison/proof reads cannot support predecessor selection or reviewer-to-technician reload recovery. Ship this prerequisite before finalizing the staff wireframe.

## Governing references

- ADR-0108, especially identity/comparison, proof/consumption and audience/data lifecycle
- ADR-0104; features 50 and 40; flow 66; domain glossary
- #897, #907, #914 and #915; sole integration PR #904
- diagnostic-staff-ui-foundation-packet-20261022.md and the approved foundation disclosure decision

## Owning area

Diagnostics API/application/infrastructure and contracts own scoped candidate discovery, current eligibility, proof recovery and result projections. Admin server actions and protected order/pair file proxies own browser transport. Identity remains owner of current staff authority; no new global report/customer/staff directory or pair-material access is granted.

## Acceptance criteria

- [ ] Record the approved minimal field/actor matrix, including a B-only technician handoff if approved. Full pair contents and history remain independently A/B-authorized. Reviewer gets only named currently eligible B technicians, never reception's general directory.
- [ ] B-scoped stable bounded discovery finds an authorized retained predecessor beyond the first 50 assignments without ID entry. Inaccessible candidates, counts and protected details remain undisclosed; continuation and empty semantics cannot falsely assert global absence.
- [ ] Preserve exact immutable A pins, explicit corrections and required retained pair material. Missing/expired/erased or inconsistent material refuses without partial protected comparison. No client continuity decision or root selection shortcut.
- [ ] Provide current server usability and authorized handoff/result discovery after reload. Readable historical, invalidated and consumed proofs cannot be mistaken for usable proof. B-only consumption does not grant A access. Current assignment/session/qualification/rights changes fence every read and action.
- [ ] Recover a lost issuance reply without duplicate logical issuance/audit, and persist/recover exact consumption request identity and its authorized existing B result across reload. Do not blindly repost, revive an invalidated proof or expose protected cache data.
- [ ] Add current-session private/no-store admin transport for order identity history/classified staging/upload/read and exact pair comparison/provenance. Bound streamed bytes/type/size; validate mutations; keep tokens/storage locators out of browser data. Preserve rights-before-bytes and null-hold restrictions without invented dates, basis or rights.
- [ ] Contracts and behavior tests cover traversal, non-reception reviewer selection, B-only versus dual-authorized reads, stale authority, missing material, invalidation, lost replies, concurrent consumption, exact retry and surviving-B result recovery. Supply real disposable HTTP/DB/storage evidence before claiming the prerequisite shipped.
- [ ] Preserve ordinary unlinked drafts, same-visit corrections, immutable A, B's own template/date/mileage/empty findings, audience separation and existing erasure/retention/worker obligations. No inherited findings, media, access or consent.

## Out of scope

- Target #915 staff visual implementation, wireframe and hi-fi artifacts, customer/mobile reader redesign
- Choosing broader automatic issuers, multiple-root automatic policy or public publisher authority
- Removing corrected mixed/public-transfer acceptance from #897
- Real center/provider activation, production promotion, store submission or public launch
- Another integration PR, reset, Railway retry or protection bypass

## Depends on

- Verified #907 intake and #900/#906 staff authority/shell checkpoints
- Verified #914 identity/proof checkpoint assembled into #904
- Founder-recorded minimum disclosure/handoff decision from this foundation audit

## Special verification

Use real feature contracts/actions and network/database/storage boundaries. Do not mock repository feature components/actions or substitute collection for acceptance. Add erasure/rights-expiry/worker cleanup evidence where the new projections or recovery touch those contracts. Browser/deployed multi-actor desktop/tablet TK/RU/EN proof follows approved visual implementation and valid staging prerequisites; it is not claimed by this prerequisite's API evidence. Three prior Railway refusals remain terminal.
```

## Delivery reconciliation and next action

Root should present the single frontier and this one prerequisite draft, obtain the needed disclosure/policy direction, then assign the bounded prerequisite in isolation from the verified integration checkpoint. Do not begin an improvised screen. No issue is created by this audit.

After the prerequisite ships into the assembled candidate, follow sequential fresh wireframe designer, independent UX review, hi-fi designer, independent accessibility/localization/microinteraction review and explicit design approval. UI-MODE design readiness :1-5 and design-grill SKILL foundation/design gates require adequate design before nontrivial implementation. Final fixed-SHA Standards/Spec review is later and must include the implementation, not this report.

`design-grill/DELIVERY.md:5,15-20` ordinarily names a design branch and approval-gated PR. The founder's explicit sole-integration mandate takes precedence over that default delivery packaging. Keep independent designer/reviewer roles and approval gates; have Root assemble approved canonical wireframe/hi-fi commits and their review evidence into #904 in dependency order. Do not open another design integration PR or merge a docs-only PR as a prerequisite to #904. No extra packaging permission is needed to preserve the already instructed sole PR; unresolved product decisions still need founder direction.

Terminal handoff: NEEDS_FOUNDATION. Repository remains unchanged; one complete report under /tmp; no running subwork or polling. Next action is Root's foundation decision/issue approval step, followed by the bounded prerequisite, not visual design or release sign-off.
