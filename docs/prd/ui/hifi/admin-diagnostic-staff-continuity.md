# Admin — diagnostic staff continuity hi-fi

## Status, purpose and sources

Proposed implementation handoff for #915 within #897, sole integration PR #904. Source base: `add640a8de601905b2c10b8451d5184be14222b7`; accepted bounded wireframe checkpoint `5e4aa990`. Coordinator authorized sequential hi-fi after inspecting the F1/F2/F3 fix. This document neither approves itself nor establishes rendered, native-language or runtime acceptance.

Extend the existing `/diagnostics` workspace: B technician records current physical identity and rights-limited support; an independently authorized reviewer compares exact A/B material and issues a handoff for a named B technician; that technician recovers and consumes B's handoff into an empty B draft. Preserve the ordinary empty report, same-visit editorial correction, current review inputs and immutable release identity. No dashboard refurbishment, new permission/API, ownership-grant capture, rights policy, customer reader or PDF redesign.

Authority: [accepted wireframe](../wireframes/diagnostic-staff-continuity.md), [dispatch and recovery decision](../../../evidence/issue-897/staff-workflow-dispatch-20261029.md), ADR-0104/0108/0109, Feature 50/51 and Flow 66. [Prior independent wireframe review](../../../evidence/issue-915/staff-continuity-ux-review-r1-20261029.md) supplies findings, not approval of this hi-fi.

Source anchors below are repository-relative:

- `apps/admin/src/app/diagnostics/{DiagnosticWorkspace,DiagnosticIntake,DiagnosticAuthoring,DiagnosticBodyMap}.tsx`, `copy.ts`, `actions.ts`; current native controls and exact copy.
- `apps/admin/src/lib/i18n.tsx`, `apps/admin/src/lib/diagnostic-transport.ts`, `apps/admin/src/lib/diagnostic-identity-files.ts`; locale, sanitized failures and protected proxies.
- `apps/admin/src/app/globals.css`, `packages/ui/theme/theme.css`, `packages/ui/components/{Button,Input,Card}.tsx`; actual styles, not assumed shadcn variants.
- `packages/contracts/src/schemas/diagnostics.ts`; strict rights/capture/comparison/discovery/handoff/request inputs.
- `PrismaDiagnosticIntake.ts`, `PrismaDiagnosticIdentityEvidence.ts`, `PrismaDiagnosticReports.ts`, `PrismaDiagnosticContinuityProofs.ts` under `apps/api/src/modules/diagnostics/infrastructure/`; current raw, usable graph, complete pair and durable request semantics.
- Existing `DiagnosticWorkspace.spec.tsx`, `identity-transport.spec.ts`, `identity-files.transport.spec.ts`, `request-recovery.transport.spec.ts`: source evidence only, not executed here.

## Layout and responsive behavior

Keep existing shell and one page. Order: h1/synthetic scope → Back/Load current version → current B summary and intake → h2 This visit's identity → h2 Link this new inspection → h2 Reports and revisions. Role-specific content follows current server admission; navigation visibility confers no authority. Existing reception details/summary and report authoring stay in place.

Reuse `space-y-6` between major sections (24px), `space-y-4` inside (16px), `gap-3` button rows (12px), `gap-4` field grids (16px), `border-t pt-5` for separation. h1 `text-2xl font-semibold`; h2 `text-lg font-medium`; h3/legend `font-medium`; labels/body `text-sm` where current forms use it. Help is `text-sm text-text-secondary max-w-prose`; no smaller essential text. Current font is Inter/system sans, not a new typeface.

Only the complete pair has two columns: `grid grid-cols-1 gap-6 lg:grid-cols-2`, A then B in DOM. At desktop ≥1024px each has a visible role heading, date UTC, mileage and reference, original observation, pinned identifiers, full explicit correction chain, and complete supporting images. No row alignment that implies equivalence of different records. At tablet 768–1023px they stack A then B. Review controls follow both sides, never inside the A column. At narrower effective widths/200% zoom use one column; `min-w-0`, `break-words`/`overflow-wrap:anywhere` on long values, no page-wide horizontal scroll. No sticky footer or overlay can cover focus. Buttons wrap and grow vertically with translated text.

Within identity: read-only retained history first, current raw binding and eligibility next; separate native details for Supporting images and Capture identity record / Correct this eligible identity leaf. Open the active form and any ancestor details when focusing validation. History details may collapse; comparison content required for issuance stays expanded. No mandatory support hidden in a carousel, hover or abbreviated count.

## Token and component map

The workspace currently uses native HTML and local class strings. Keep that vocabulary. Shared `Button` variants actually are `primary/secondary/ghost/destructive`, default `md`=40px; shared `Input` is 40px. Neither is already the diagnostic form control; do not claim a shared `default` variant or wholesale migrate this page. Compose native section/fieldset/legend/label/input/select/textarea/button/details/dl/ul/status/alert instead. New behavior needs local compositions, no new shared primitive.

The admin stylesheet overrides imported shared `--background`, `--border` and radius aliases. Resolve the final cascade, not the shared palette alone:

| Use | Exact local classes | Light / dark source binding |
|---|---|---|
| Page/body | `bg-background text-foreground` | admin background `oklch(1 0 0)` / `oklch(.145 0 0)`; foreground `.145` / `.985` |
| Form/control surface | `bg-background text-foreground` | same pair, replacing diagnostic `bg-white` locally |
| Read-only group | `bg-muted text-foreground rounded-md p-4` | admin muted `.97` / `.269`; explicit heading says read-only |
| Help/secondary text | `text-text-secondary` | shared secondary neutral-600 `#525251` / neutral-300 `#D2D0CB` |
| Control boundary | `border border-neutral-500 dark:border-neutral-400` | shared `#737170` / `#A8A6A0`; avoid subtle `border-input` as sole boundary |
| Section separator | `border-border` | admin `.922` / white 10%; decorative only |
| Primary step button | native `min-h-11 rounded-md border px-4 py-2 text-sm font-medium bg-primary text-primary-foreground` | admin primary `.205` / `.922`, foreground `.985` / `.205` |
| Primary hover/pressed | `hover:opacity-90 active:opacity-80` | retain readable label, verify composited contrast |
| Secondary button | native min-height/border/padding above; `bg-background text-foreground hover:bg-muted active:bg-accent` | admin background/muted/accent in both modes |
| Focus | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-neutral-100` | explicit existing-palette outline against the adjacent page surface, including primary buttons and language selector; verify rendered contrast |
| Disabled | native `disabled` plus `disabled:opacity-50` | visible associated reason text; never color alone |
| Error/status | foreground text, heading/prefix and border; `role=alert` or `role=status` | no red/green-only meaning or low-contrast status-token text |

Native fields: `mt-1 min-h-11 w-full rounded-md border px-3 py-2 text-sm` plus surface/boundary/focus above; textarea rows=3, `p-3`, vertical resize. Checkbox/radio itself keeps native behavior; entire associated label is `flex min-h-11 items-center gap-3` with padding so ≥44px is clickable. Details summary ≥44px; language selector currently `min-h-10`, requires local target correction to ≥44px during implementation. Apply local dark-safe styles also to existing diagnostic intake/review controls that appear in this journey; no global dashboard theme rewrite. `rounded-md` follows admin `--radius*.8` (8px at default 16px root), not an invented constant.

Normal text/help ≥4.5:1; large text and meaningful boundaries/focus ≥3:1 in both modes. These are requirements, not measured results. Test effective computed colors, opacity/hover, native disabled and focus against adjacent backgrounds. Adjust call-site foreground/boundary using this existing palette if render measurement fails; no new theme system.

## Identity capture and correction

B observation uses existing `DiagnosticIntake` and `diagnosticIntake(B,'vehicle',…)`. Staff enter actual UTC time, mileage and VIN/manual reference; never copy A or fabricate time. Fresh `diagnosticIdentityRecords(B)` returns ascending orderVersion: highest returned unerased raw binds every new structured record. No history-row selector retargets writes. Empty/unavailable current raw leaves submission unavailable with Load current version. Existing pinned originals stay read-only.

`diagnosticIdentityEvidence(B)` exposes currently usable material, not the complete hidden graph. Show returned records and explicit `correction.supersedesId` chains; no newest-root rule. Root is provisional only for current raw without structured evidence. Correction explicitly binds the reviewed retained usable unsuperseded leaf, possibly attached to earlier raw, while the new record binds current raw. Hidden/filtered absence cannot establish no earlier root/successor/use. Server append checks remain decisive. Generic refusal never reveals a hidden fact. Refresh unarms target/support review; require fresh explicit review before save.

Two independent blank fieldsets: image rights and structured-record rights. Each requires purpose≤300, basis≤500, provenance≤1000, personal/pseudonymous selection, explicit UTC authorized end and retention reason≤500. Supplier restrictions≤1000 is optional. No inferred duration, defaults, automatic cross-copy, public use or hold control. Fixed `vehicle_observation`, `[service]`, `until`, `hold:null` stay in transport; explain service/staff-only scope with copy below. A read-only rights comparison does not populate a declaration. Existing image descriptors do not return image-rights declarations: display those only from the current reviewed local declaration, never reconstruct them from a record's rights or hash.

File picker is disabled until image rights validate. JPEG/PNG/WebP, ≤10 MiB (`10*1024*1024` bytes); stable ID per File. Explicit Upload stages rights through `diagnosticStageIdentityProvenance`, then PUTs bytes through the order identity-provenance proxy with current order version. Only a returned verified sanitized WebP descriptor is attachable. Show upload state text, not invented percentage. On recoverable failure retain File/ID/declaration in memory; explicit retry uses the same binding after rights/version review. A stale declaration is not silently rewritten. Discard removes local File/object URL, not a claimed server deletion. Reload needs reselecting; no localStorage/IndexedDB/cache/service-worker protected blob.

Identifier rows: blank kind select (`vin_stamp/chassis_stamp/manufacturer_plate`), location≤300, value≤500, verified image choices. 1–20 complete rows; unique `(kind,location)`; 1–20 unique references per row. Add/remove row are visible text buttons with numbered localized names. Correction additionally needs full replacement identifiers, separate record rights, explanation≤1000 and at least one submitted verified image unused by any earlier B evidence. Already verified unused material qualifies; do not force a new upload. Used material may accompany it. Staged-only is not verified. Known local verified descriptors/current permitted evidence are the only choices: no unused-image directory, manual UUID input or claim that absence from a filtered list proves unused. Mark known used vs newly verified support; server checks full prior usage. After an explicit successful append (root or correction), refresh the read-only original/full chain, announce Saved and focus the saved-record heading (`tabIndex=-1`); if unavailable, focus the identity eligibility heading. No automatic repinning or continuity inference.

## Exact comparison, issuance and B-only use

`diagnosticPredecessors(B,{cursor?})` is separate from assigned queue. Candidate rows expose only returned reference/date/mileage and Compare with B. Continue with opaque returned cursor even on zero-result partial pages; exhaustion names the current authorized retained scope. Restart begins a new scoped scan, no global absence claim.

`diagnosticReinspectionComparison` supplies the exact full pair. Bind versions/raw IDs/hashes to that response, not current workspace guesses. For each side display pinned observation/evidence and all explicit corrections with original/corrected values, explanation, record rights and support. Enumerate the deduplicated union of every provenance ID in both evidence records and every correction, freeze deterministic ID ordering internally. Fetch every required image through exact-pair protected proxy; no report-photo/order-photo fallback or cached bytes. Display per-image visit/kind/location context and reviewable image, not hashes as a recognition task. Missing support, oversize union (>40), insufficient material or unresolved protected image failure keeps issuance unavailable; no pruning or subset checkbox.

Below full pair: method blank select, rationale≤1000, named eligible B technician from `diagnosticLinkingTechnicians` only, complete-support acknowledgment initially unchecked, summary of A/B references/date/mileage plus chosen name. No default technician/method/acknowledgment. An acknowledgment records review, not admission. Comparative attestation and automatic VIN validation both remain subject to current server rules. Equal VIN text does not prove eligibility. Reviewer must remain independent of A author/reviewer and B technician and authorized on both. ADR-0109 grant capture is outside this flow; do not offer synthetic substitute permissions.

Explicit Issue uses durable prepare then execute actions below. Completion says issuance recorded/historical, not usable. Do not create a B report or navigate to publication. The selected B technician uses Check handoffs and previous attempts to fetch B-owned handoffs/request pages. Only usable opaque handoff rows and B result are exposed. Multiple rows use local ordinals with no chronology/preference/preselection. B's own link reason≤1000 and explicit Create empty linked draft use chosen proof/current B version and a stable generated report ID through durable execution. B starts with its own date/mileage/template, empty findings, no inherited images/consent/permissions.

Completed consumption opens authorized B directly via `diagnosticWorkspace(B)`/B report. No A or full-proof fetch. Suppress current generic `successorOf` history output in B-only view: no A ID/details in rendered text, DOM, accessible labels, toast, telemetry or persistence. Do not derive lineage disclosure authority from that field. Current B authority still applies.

## Page-state and recovery matrix

| State | Structure/actions/focus | Data behavior |
|---|---|---|
| Default | B summary, role-appropriate identity/linking, existing Reports; current step's primary action only | In-memory current B input, fresh machine bindings |
| Loading | Keep headings and polite loading status; affected region `aria-busy=true`; disable affected writes | Hide old pair on candidate change; preserve same-B unfinished text while authorized; ignore old-generation responses |
| Empty raw/support | Eligibility/support help; Load current version or permitted image capture | No invented history/verified result; no forced upload if verified unused support already available |
| Empty partial/exhausted scan | `pageEmpty`+Continue / `scopeEmpty`+Restart | Cursor only from response; no global absence claim |
| Empty eligible technicians/handoffs | `noTechnician` / `noUsable`; Check current state | No guessed names, refusal reason or expiry |
| Error, read | Inline alert and Retry for that read; retained current safe input | No fallback to another disclosure path |
| Offline / network unavailable | `network` notice; explicit read retry; mutation result unknown uses Check result | No offline queue, timer retry, cached protected preview or save claim; do not call every 5xx offline |
| Stale/conflict | Alert + Load current version; surviving trigger retains focus, else eligibility/recovery heading | Unarm target/pair/ack/handoff; keep safe local text, retain frozen exact command separately; refresh never changes that command or executes |
| Upload failure | Existing uploadError/uploadRetry; invalid image uses `invalidIdentityImage`; Discard pending image | Same File/ID in memory only, recheck rights/version; failed response is not verified |
| Protected pair image fails | Remove failed preview/revoke URL, clear acknowledgment; focus Comparison recovery heading if focused content/control was removed | Issue unavailable. Failed-image status, Retry protected image, Reload comparison, Back to candidates in that order. No cached image |
| Pair image retry succeeds | Announce `imageReady`; retain Retry focus if surviving, otherwise focus image status (`tabIndex=-1`) | Retry exact pair request under current authority; full pair/support re-review, then later explicit Issue |
| Reload comparison / Back | Focus fresh pair heading / candidates heading (`tabIndex=-1`) | Revoke previews and unarm acknowledgment; Back does not issue/save |
| Denied/auth deferred (401/403) | Focus denial heading, existing denied copy + Back to assigned work; no image retry | Clear identity/comparison/form text, candidate/name choices, exact commands, File refs, URLs and async generation; no protected fallback. Fresh authorized entry needs fresh reads/review |
| Handoff invalidated/expired/omitted | Generic `noUsable` or changed/unavailable, Check current state | No inferred cause/timestamp; historical proof never revives on value reversal |
| Completed consumption | B result status and Open B draft | Open B only, no A fetch |

No optimistic server save, issuance or consumption. Press feedback is immediate (<100ms goal); success only after confirmed authorized result. Persist only the existing nonprotected locale cookie.

## Request identity and interrupted actions

Use `diagnosticPrepareContinuityRequest`, `diagnosticExecuteContinuityRequest`, `diagnosticRecoverContinuityRequest`, `diagnosticContinuityRequests`, and `diagnosticContinuityHandoffs`. No UI shortcut through direct issue/consume transports.

| Trigger | Rules | Feedback and repeated/interrupted behavior |
|---|---|---|
| Issue/Create linked draft | Validate/review; prepare kind only; keep returned requestId; freeze exact command in same-page memory before execute | One synchronous in-flight fence per action; repeated click/Enter does not prepare/execute again. Busy label `working`; no percent or auto-navigation |
| Lost execute reply | Mark completion unknown; require explicit GET Check result first | Completed consume → Open B; completed issue → historical notice; pending → exact retry only if frozen original command remains and current authority permits. No automatic retry |
| Retry same reviewed command | Same requestId and byte-for-byte semantic command, including report ID, versions, method/rationale and ordered provenance | Never substitute refreshed version, proof, technician or reason. Changed binding conflict → recover result, never replacement request |
| Reload + Check attempts | Paginate current-session request list; explicit choice among pending issue/link ordinals | Pending input was not saved. Fresh re-entry/review under SAME requestId; no claim original candidate/text/command recovered. No protected browser command store |
| Lost prepare reply | Discover all available request pages before another preparation is offered | Found handles remain explicit choices; no invented timestamp, author, candidate or preferred pending handle; failed discovery offers read retry, no replacement prepare |
| Re-enter pending request | Fresh current reads and complete form/review; explicit execute with same requestId | Earlier execute may commit after pending GET: surface changed-command conflict and recover. Do not bypass with new request |
| Completed issue | Historical handle only | Current usability comes only from fresh B handoff admission, never recovered issuance/full-proof read |
| Session no longer available | Generic access failure, clear protected state | New sign-in does not adopt old Session's request; no background replay |
| Locale change | Existing provider changes locale without keyed remount | Preserve safe values, selected File, reviewed bindings and frozen command while authority remains; translate chrome only, no mutation/prepare/upload |
| Leave/change B/report/candidate with unfinished work | Inline confirmation in current page: Save where valid, Stay, Discard local input | Focus confirmation heading, then Stay first; Stay returns trigger focus, Discard performs chosen navigation. Pending handle is not saved input; preserve existing authoring dirty safeguards |

Native details toggle immediately. Add/remove identifier focuses new kind / next surviving row, else Add identifier. Form error summary receives focus after explicit submit and links to each invalid labeled field; on blur show associated error without stealing focus. Explicit identity append success focuses the saved-record heading, falling back to the identity eligibility heading if unavailable. Only unrelated background refresh/status retains surviving trigger focus; removal falls back to the relevant eligibility/recovery heading. Enter in textarea adds newline, never issues. No automatic field selection, hover-only help or hidden keyboard command.

## Motion and accessibility

No animated layout, image fade, smooth auto-scroll, success celebration or progress fiction. Optional control color/opacity transition uses existing `duration-fast`=150ms and `ease-standard=cubic-bezier(.4,0,.2,1)`; `motion-reduce:transition-none` removes it. Busy text is sufficient; do not require a spinning indicator. Focus movement is immediate and programmatic only for the explicit transitions above.

One h1, ordered h2/h3; fieldset/legend for rights, identifiers, method and review vehicle. Distinct IDs per row and object; visible labels, `aria-describedby` for requirements/help/error, `aria-invalid` after validation. Native disabled controls have nearby persistent reason text; busy trigger accessible name remains action plus Working. Status uses atomic polite live region for one outcome, errors use alert once; do not announce entire pair or duplicate status in every row. Required support status and original/corrected labels use words in both themes. No imagery conveys comparison result without readable data.

Protected image accessible name/alt is localized `imageLabel` with only authorized visit role, identifier kind and location; never filename/hash/customer text as extra context. No image coordinates or zoom needed for a critical control; render at available width with intrinsic ratio, `object-contain`, no crop. Native browser zoom and readable full-width image remain available. If image cannot be inspected, the reviewer cannot acknowledge all support. Escape retains native select/details behavior; there is no new modal/trap. Focus order follows visual/DOM order A then B then review/actions; tabs never enter removed/hidden protected content.

Later acceptance must measure 44px target areas (checkbox labels, summary, language switch), contrast, long RU/TK expansion, keyboard image recovery/denial, screen-reader status timing and 200% zoom at desktop and tablet. Source classes alone prove none of these.

## Trilingual copy and keys

Existing `diagnosticCopy[locale]` remains authority for true reuse: title/scope/queue/open/back/loading/refresh/retry/denied/saved; observe/observedAt/mileage/vin/manual/manualReference; create/correct/correctionNotice/newInspection; reason/submit/return/finalize/withdraw/selfReview/reviewNotice/releaseWarning; vehicle/vehicleMake/vehicleModel/vehicleYear; existing authoring, findings, report statuses and release identity strings. Do not reuse `kind` (observation classification), `location` (finding-map action), `save` (assessment), `compare` (stored assessment) or `error` (claims work retained) for new identity/recovery meanings. New key groups below are proposed properties in `copy.ts`, not claimed existing translations. All new EN/RU/TK wording is **PROPOSED — native review required**; existing keys are source reuse, not evidence of native approval.

Use `AdminDate`/UTC convention with `tk-TM`, `ru-RU`, `en-GB`; locale-aware mileage display, canonical numeric state unchanged. Typed UTC form values serialize as UTC; never parse formatted display on locale change. User-entered values/rationale/names remain verbatim. Placeholders in braces are typed values, never concatenated unlocalized English. `n` is a local ordinal, not chronology. Candidate/visit context composes existing visit/observedAt/mileage labels; protected image context uses only permitted roles/kind/location. The following table is the complete new string inventory; do not expose raw enum tokens or transport errors.

| Proposed key | EN | RU | TK |
|---|---|---|---|
| identity.title | This visit's identity | Идентификация на этом осмотре | Şu barlagdaky awtoulag şahsyýeti |
| identity.history | Retained identity history · read-only | Сохранённая история идентификации · только чтение | Saklanan şahsyýet taryhy · diňe okamak üçin |
| identity.currentRaw | Current recorded observation | Текущее записанное наблюдение | Häzirki ýazylan gözegçilik |
| identity.original | Original observation | Исходное наблюдение | Asyl gözegçilik |
| identity.corrected | Supported correction | Исправление с подтверждением | Subutnamaly düzediş |
| identity.eligibility | Identity recording availability | Доступность записи идентификации | Şahsyýet ýazgysynyň elýeterliligi |
| identity.unavailable | Recording is unavailable or has changed. Load the current version and review before saving. | Запись недоступна или условия изменились. Загрузите текущую версию и проверьте данные перед сохранением. | Ýazgy elýeterli däl ýa-da şertler üýtgedi. Häzirki wersiýany ýükläp, ýatda saklamazdan öň maglumatlary barlaň. |
| identity.supportingImages | Supporting images | Подтверждающие изображения | Tassyklaýjy suratlar |
| identity.imageRights | Rights for this supporting image | Права на это подтверждающее изображение | Şu tassyklaýjy surata bolan hukuklar |
| identity.imageRightsHelp | This declaration covers the retained image only. | Эта декларация относится только к сохраняемому изображению. | Bu beýannama diňe saklanýan surata degişlidir. |
| identity.recordRights | Rights for this identity record | Права на эту запись идентификации | Şu şahsyýet ýazgysyna bolan hukuklar |
| identity.recordRightsHelp | This separate declaration covers the structured identity record. | Эта отдельная декларация относится к структурированной записи идентификации. | Bu aýratyn beýannama gurluşly şahsyýet ýazgysyna degişlidir. |
| identity.purpose | Purpose | Цель | Maksat |
| identity.basis | Authority or legal basis | Полномочие или правовое основание | Ygtyýarlyk ýa-da hukuk esasy |
| identity.provenance | Source and provenance | Источник и происхождение | Çeşme we gelip çykyşy |
| identity.identifiability | Identifiability | Идентифицируемость | Şahsyýeti kesgitlemek mümkinçiligi |
| identity.personal | Personal data | Персональные данные | Şahsy maglumatlar |
| identity.pseudonymous | Pseudonymous data | Псевдонимизированные данные | Lakamlaşdyrylan maglumatlar |
| identity.until | Authorized retention end, UTC | Разрешённый срок хранения до, UTC | Rugsat edilen saklanyş möhletiniň soňy, UTC |
| identity.retentionReason | Retention reason | Основание хранения | Saklamagyň sebäbi |
| identity.supplierOptional | Supplier restrictions (optional) | Ограничения поставщика (необязательно) | Üpjin edijiniň çäklendirmeleri (hökmany däl) |
| identity.rightsHelp | Service use only. Staff-only access. No hold can be entered here. Image rights do not establish ownership or publication rights. | Только служебное использование и доступ сотрудников. Удержание от удаления здесь не задаётся. Права на изображение не подтверждают владение или право публикации. | Diňe hyzmat üçin we işgärlere elýeterli. Bu ýerde pozmagy saklatmak bellenmeýär. Surat hukuklary eýeçiligi ýa-da çap etmek hukugyny tassyklamaýar. |
| identity.chooseImage | Choose supporting image | Выбрать подтверждающее изображение | Tassyklaýjy suraty saýla |
| identity.upload | Upload permitted image | Загрузить разрешённое изображение | Rugsat edilen suraty ýükle |
| identity.rightsRequired | Complete the image rights before choosing an image. | Заполните права на изображение перед выбором файла. | Surat saýlamazdan öň onuň hukuklaryny dolduryň. |
| identity.invalidIdentityImage | Choose a JPEG, PNG or WebP image up to 10 MiB. | Выберите JPEG, PNG или WebP размером до 10 МиБ. | 10 MiB-a çenli JPEG, PNG ýa-da WebP suraty saýlaň. |
| identity.verified | Verified supporting image | Проверенное подтверждающее изображение | Barlanylan tassyklaýjy surat |
| identity.used | Already referenced | Уже использовано в записи | Öň ýazgyda ulanylan |
| identity.newVerified | Verified in this session; prior use is checked on save | Проверено в этом сеансе; предыдущее использование проверяется при сохранении | Şu sessiýada barlanyldy; öň ulanylandygy ýatda saklananda barlanýar |
| identity.unusedHelp | A correction needs at least one verified image not used by earlier identity records. An already verified unused image qualifies. | Для исправления нужно хотя бы одно проверенное изображение, не использованное в прежних записях. Подходит уже проверенное неиспользованное изображение. | Düzedişe öňki şahsyýet ýazgylarynda ulanylmadyk azyndan bir barlanylan surat gerek. Öň barlanylan, ulanylmadyk surat hem bolýar. |
| identity.capture | Capture identity record | Записать данные идентификации | Şahsyýet ýazgysyny döret |
| identity.correctLeaf | Correct this eligible identity record | Исправить эту доступную запись идентификации | Şu degişli şahsyýet ýazgysyny düzet |
| identity.correctionHelp | The original remains unchanged. Review the bound record and enter the complete corrected identifiers with supporting images. | Оригинал не меняется. Проверьте связанную запись и введите полный набор исправленных идентификаторов с подтверждающими изображениями. | Asyl ýazgy üýtgemeýär. Baglanan ýazgyny barlap, düzedilen belgileri tassyklaýjy suratlar bilen doly giriziň. |
| identity.identifier | Identifier {n} | Идентификатор {n} | Belgi {n} |
| identity.identifierKind | Identifier type | Тип идентификатора | Belginiň görnüşi |
| identity.vinStamp | Stamped VIN | Выбитый VIN | Basylan VIN |
| identity.chassisStamp | Stamped chassis number | Выбитый номер шасси | Basylan şassi belgisi |
| identity.manufacturerPlate | Manufacturer plate | Табличка изготовителя | Öndürijiniň tagtasy |
| identity.physicalLocation | Physical location on vehicle | Место на автомобиле | Awtoulagdaky ýeri |
| identity.identifierValue | Observed identifier value | Наблюдаемое значение идентификатора | Görlen belginiň bahasy |
| identity.addIdentifier | Add identifier | Добавить идентификатор | Belgi goş |
| identity.removeIdentifier | Remove identifier {n} | Удалить идентификатор {n} | {n} belgini aýyr |
| identity.supportChoice | Supporting image {n} | Подтверждающее изображение {n} | Tassyklaýjy surat {n} |
| identity.correctionExplanation | Recording correction explanation | Объяснение исправления записи | Ýazgy düzedişiniň düşündirişi |
| identity.save | Save identity evidence | Сохранить данные идентификации | Şahsyýet subutnamasyny ýatda sakla |
| identity.append | Append supported correction | Добавить исправление с подтверждением | Subutnamaly düzediş goş |
| continuity.title | Link this new inspection | Связать этот новый осмотр | Şu täze barlagy bagla |
| continuity.freshWork | This creates an empty report for this visit. Previous findings, images, access and publication consent are not copied. | Для этого осмотра создаётся пустой отчёт. Прежние результаты, изображения, доступ и согласие на публикацию не копируются. | Şu barlag üçin boş hasabat döredilýär. Öňki netijeler, suratlar, giriş we çap etmek razylygy göçürilmeýär. |
| continuity.search | Find authorized predecessors | Найти доступные предыдущие отчёты | Ygtyýarly öňki hasabatlary tap |
| continuity.continue | Continue search | Продолжить поиск | Gözlegi dowam et |
| continuity.restart | Start search again | Начать поиск заново | Gözlegi täzeden başla |
| continuity.pageEmpty | No choices on this page. More pages remain. | На этой странице нет вариантов. Есть следующие страницы. | Bu sahypada saýlaw ýok. Indiki sahypalar bar. |
| continuity.scopeEmpty | No retained predecessor is available in your current search scope. | В текущей области поиска нет доступного сохранённого предыдущего отчёта. | Häzirki gözleg çägiňizde saklanan öňki hasabat elýeterli däl. |
| continuity.compare | Compare with this visit | Сравнить с этим осмотром | Şu barlag bilen deňeşdir |
| continuity.pair | Complete pair comparison | Полное сравнение двух осмотров | Iki barlagyň doly deňeşdirmesi |
| continuity.prior | A · previous inspection | A · предыдущий осмотр | A · öňki barlag |
| continuity.current | B · current inspection | B · текущий осмотр | B · häzirki barlag |
| continuity.support | Complete retained supporting material | Все сохранённые подтверждающие материалы | Ähli saklanan tassyklaýjy materiallar |
| continuity.imageLabel | {visit}: {kind}, {location} — supporting image | {visit}: {kind}, {location} — подтверждающее изображение | {visit}: {kind}, {location} — tassyklaýjy surat |
| continuity.comparisonRecovery | Comparison recovery | Восстановление сравнения | Deňeşdirmäni dikeltmek |
| continuity.imageFailed | A required image is unavailable. Review the complete pair and all support again after recovery before issuing a handoff. | Нужное изображение недоступно. После восстановления заново проверьте оба осмотра и все материалы перед выдачей разрешения на связывание. | Gerekli surat elýeterli däl. Dikeldilenden soň baglamaga rugsat bermezden öň iki barlagy we ähli materiallary täzeden barlaň. |
| continuity.retryImage | Retry protected image: {image} | Повторить загрузку защищённого изображения: {image} | Goragly suraty täzeden ýükle: {image} |
| continuity.imageReady | Supporting image is available. Review both visits and all required material again. | Подтверждающее изображение доступно. Заново проверьте оба осмотра и все нужные материалы. | Tassyklaýjy surat elýeterli. Iki barlagy we ähli gerekli materiallary täzeden barlaň. |
| continuity.reloadComparison | Reload comparison | Загрузить сравнение заново | Deňeşdirmäni täzeden ýükle |
| continuity.backCandidates | Back to candidates | К вариантам предыдущего отчёта | Öňki hasabat saýlawlaryna dolan |
| continuity.method | Continuity comparison method | Способ подтверждения связи осмотров | Barlaglaryň baglanyşygyny deňeşdirmegiň usuly |
| continuity.attest | Comparative attestation | Подтверждение по результатам сравнения | Deňeşdirme arkaly tassyklama |
| continuity.automaticRequest | Request automatic VIN validation | Запросить автоматическую проверку VIN | VIN-i awtomatik barlamagy sora |
| continuity.methodHelp | Matching text does not authorize a link. The server checks current evidence, authority and method requirements. | Совпадение текста не разрешает связывание. Сервер проверяет текущие доказательства, полномочия и требования к способу сравнения. | Tekstiň gabat gelmegi baglamaga rugsat bermeýär. Serwer häzirki subutnamalary, ygtyýarlygy we usulyň talaplaryny barlaýar. |
| continuity.rationale | Comparison rationale | Обоснование сравнения | Deňeşdirmäniň esaslandyrmasy |
| continuity.technician | Eligible technician for this visit | Допущенный техник этого осмотра | Şu barlaga degişli hünärli tehnik |
| continuity.noTechnician | No currently eligible technician is available. Load the current version. | Сейчас нет доступного допущенного техника. Загрузите текущую версию. | Häzirki wagtda degişli hünärli tehnik elýeterli däl. Häzirki wersiýany ýükläň. |
| continuity.reviewedAll | I reviewed both visits and all required supporting material. | Я проверил оба осмотра и все необходимые подтверждающие материалы. | Iki barlagy we ähli gerekli tassyklaýjy materiallary barladym. |
| continuity.reviewRequired | Review the complete pair, all images, method, rationale and selected technician before issuing. | Перед выдачей проверьте оба осмотра полностью, все изображения, способ сравнения, обоснование и выбранного техника. | Rugsat bermezden öň iki barlagy doly, ähli suratlary, usuly, esaslandyrmany we saýlanan tehnigi barlaň. |
| continuity.insufficient | The complete required material is unavailable. Linking is unavailable; an ordinary empty report may still be available. | Полный набор нужных материалов недоступен. Связывание недоступно; обычный пустой отчёт может оставаться доступным. | Gerekli materiallaryň doly toplumy elýeterli däl. Baglamak elýeterli däl; adaty boş hasabat elýeterli bolup biler. |
| continuity.issue | Issue continuity handoff | Выдать разрешение на связывание осмотров | Barlaglary baglamaga rugsat ber |
| continuity.issuedHistorical | Issuance recorded. This is a historical result; current use is checked again for the selected technician. | Выдача записана. Это исторический результат; возможность использования заново проверяется для выбранного техника. | Rugsat berlişi ýazga alyndy. Bu öňki netije; häzirki ulanyş mümkinçiligi saýlanan tehnik üçin täzeden barlanýar. |
| continuity.check | Check handoffs and previous attempts | Проверить разрешения и прежние попытки | Rugsatlary we öňki synanyşyklary barla |
| continuity.usable | Usable handoff for this inspection {n} | Доступное разрешение для этого осмотра {n} | Şu barlag üçin ulanyp bolýan rugsat {n} |
| continuity.noUsable | No currently usable handoff is available. | Сейчас нет доступного разрешения на связывание. | Häzirki wagtda ulanyp bolýan baglama rugsady ýok. |
| continuity.linkReason | Link reason for this visit | Причина связывания этого осмотра | Şu barlagy baglamagyň sebäbi |
| continuity.createLinked | Create empty linked draft | Создать пустой связанный черновик | Boş baglanan taslama döret |
| continuity.result | This visit's linked draft is available. | Связанный черновик этого осмотра доступен. | Şu barlagyň baglanan taslamasy elýeterli. |
| continuity.openResult | Open this visit's draft | Открыть черновик этого осмотра | Şu barlagyň taslamasyny aç |
| continuity.unknown | Completion is unknown. Check the result before retrying. | Завершение не подтверждено. Проверьте результат перед повтором. | Tamamlanandygy belli däl. Gaýtalamazdan öň netijäni barlaň. |
| continuity.recover | Check result | Проверить результат | Netijäni barla |
| continuity.retryExact | Retry same reviewed command | Повторить ту же проверенную команду | Şol barlanylan buýrugy gaýtala |
| continuity.inputNotSaved | This attempt has no saved input. Review current information and enter the input again under this same attempt. | В этой попытке введённые данные не сохранены. Проверьте текущую информацию и введите данные заново в рамках той же попытки. | Bu synanyşykda girizilen maglumat saklanmady. Häzirki maglumatlary barlap, şol bir synanyşykda maglumatlary täzeden giriziň. |
| continuity.changedCommand | This attempt has a different binding or result. Check its result; do not create a replacement attempt. | У этой попытки другая привязка или результат. Проверьте результат; не создавайте заменяющую попытку. | Bu synanyşygyň baglanyşygy ýa-da netijesi başga. Netijesini barlaň; ýerine başga synanyşyk döretmäň. |
| continuity.pendingIssue | Pending issue attempt {n} | Незавершённая попытка выдачи {n} | Garaşýan rugsat beriş synanyşygy {n} |
| continuity.pendingConsume | Pending link attempt {n} | Незавершённая попытка связывания {n} | Garaşýan baglama synanyşygy {n} |
| continuity.selectAttempt | Review this attempt | Проверить эту попытку | Şu synanyşygy barla |
| continuity.moreAttempts | Load more attempts | Загрузить ещё попытки | Has köp synanyşyk ýükle |
| continuity.moreHandoffs | Load more handoffs | Загрузить ещё разрешения | Has köp rugsat ýükle |
| staff.choose | Choose | Выберите | Saýlaň |
| staff.working | Working… | Выполняется… | Ýerine ýetirilýär… |
| staff.network | Connection unavailable. Retry reads explicitly. For an uncertain submission, check the result first. | Соединение недоступно. Повторите чтение вручную. Если результат отправки неизвестен, сначала проверьте его. | Baglanyşyk elýeterli däl. Okamagy özüňiz gaýtalaň. Iberilişiň netijesi näbelli bolsa, ilki netijäni barlaň. |
| staff.actionFailed | The action could not be completed. Review current information before retrying. | Действие не выполнено. Проверьте текущую информацию перед повтором. | Amal ýerine ýetirilmedi. Gaýtalamazdan öň häzirki maglumatlary barlaň. |
| staff.validation | Check the highlighted fields. | Проверьте отмеченные поля. | Bellenen meýdanlary barlaň. |
| staff.requiredField | Enter or select {field}. | Заполните или выберите: {field}. | {field} giriziň ýa-da saýlaň. |
| staff.tooLong | {field}: use at most {max} characters. | {field}: не более {max} символов. | {field}: iň köp {max} nyşan ulanyň. |
| staff.validUtc | Enter a valid authorized end date and time in UTC. | Введите корректные разрешённые дату и время окончания в UTC. | UTC boýunça dogry rugsat edilen ahyrky senäni we wagty giriziň. |
| staff.identifierLimit | Use 1–20 complete identifiers with distinct type and location. | Укажите от 1 до 20 полных идентификаторов с различающимися типом и местом. | Görnüşi we ýeri tapawutly 1–20 sany doly belgi ulanyň. |
| staff.supportRequired | Select 1–20 verified images for each identifier. | Выберите от 1 до 20 проверенных изображений для каждого идентификатора. | Her belgi üçin 1–20 sany barlanylan surat saýlaň. |
| staff.leaveTitle | Leave unfinished work? | Уйти с незавершёнными данными? | Tamamlanmadyk işden çykmalymy? |
| staff.leaveHelp | Unsaved input and selected files will be lost. A pending attempt does not save this input. | Несохранённые данные и выбранные файлы будут потеряны. Незавершённая попытка не сохраняет эти данные. | Ýazylmadyk maglumatlar we saýlanan faýllar ýiter. Garaşýan synanyşyk bu maglumatlary saklamaýar. |
| staff.stay | Stay | Остаться | Şu ýerde gal |
| staff.discard | Discard local input | Удалить локальные данные ввода | Ýerli girizilen maglumatlary taşla |
| staff.vehicleHelp | For manual identification, enter make, model and year before finalizing. If any vehicle display field is entered, complete all three. | При ручной идентификации укажите марку, модель и год перед утверждением. Если заполнено одно из этих полей, заполните все три. | El bilen şahsyýet kesgitlenende tassyklamazdan öň markany, modeli we ýyly giriziň. Şu meýdanlaryň biri doldurylsa, üçüsini hem dolduryň. |
| staff.vehicleInvalid | Enter make and model up to 80 characters each, and a whole year from 1886 to 2100. | Укажите марку и модель длиной до 80 символов каждая и целый год от 1886 до 2100. | Markany we modeli hersi 80 nyşana çenli, ýyly bolsa 1886–2100 aralygynda bitin san hökmünde giriziň. |

Existing `uploading/uploadError/uploadRetry/cancelUpload/saved/required/loading/refresh/back/retry` may be reused for identity when their exact message truthfully applies; object context comes from the enclosing image fieldset. `clear` remains assessment-specific; new input discard uses `staff.discard`. Generic refusal uses new `staff.actionFailed`/`identity.unavailable`, not a claim that protected text survived denial. Network unknown uses `continuity.unknown`, not existing generic `error`. Show validation by the specific failing field/constraint, not raw Zod English. All informational read-only rights fields use the same localized labels, without an editable declaration or inferred permission.

## Existing review/release inputs

Keep `DiagnosticWorkspace` review reason, private self-review checkbox, and vehicle fieldset after authoring. Make/model max 80 each; year integer 1886–2100. For manual observation vehicle display is required; if any display field is entered all three must validate. New `staff.vehicleHelp/vehicleInvalid` describe that current rule, not a VIN-only replacement. Existing reason≤1000 remains required for return/withdraw/editorial correction and private self-review finalization as currently enforced. Use existing `reason`, `selfReview`, `vehicleMake/Model/Year` labels, existing actions and notices exactly; add associated validation through generic new field keys. Controls inherit local dark-safe styles, 44px targets and focus. Language switch preserves these review values. Report change retains the existing deliberate vehicle-field reset only after unfinished-work disposition. No new consent default, automatic release, inherited publication permission or PDF gate. Preserve releaseIdentity and make/model/year reader/PDF output; finalization still creates immutable snapshot.

## UX scores, findings and path to 10

Designer estimates for this written proposal only: usability 8/10; discoverability/error tolerance 8/10; microinteraction quality 8/10. These are not independent scores, native-copy approval, resolved-review verdicts or observed user results. F1 is addressed by current-raw/explicit-leaf binding, provisional eligibility and unused verified support; F2 by exact image retry/reload/back/clear/focus and full re-review; F3 by two independent rights legends. Coordinator/fresh reviewer must determine sufficiency. No self-approval or claim that severity 3–4 has independently cleared.

Toward 10: native TK/RU/EN review of attestation, handoff, pseudonymization, pending-input and non-authority wording; rendered desktop/tablet light/dark contrast/target/zoom/expansion and keyboard/screen-reader image-failure proof; task observation showing staff distinguish identity correction, editorial correction and new visit, and can recover pending attempts without duplicate requests. Fix any fresh severity 3–4 before implementation approval. Final fresh review must independently meet the orchestration threshold (no severity 3–4, ≥8 in all three dimensions).

## Implementation notes and gates

Implement only existing admin component/copy/action/proxy callers after coordinator dispatch. Decompose capture/comparison/B-only recovery into small local compositions, retain one state owner for B authority generation and durable request binding, and keep B-only projection separate from restricted pair data. Imports follow `docs/agents/typescript-runtime.md`; no backend/contract expansion. Use existing sanitized error envelopes. Treat denied as a coordinated clear across intake/authoring/new forms; ignore every old async response after generation change or unmount. No protected telemetry, browser persistence or background replay.

No factual API dependency is currently identified. A missing source fact is returned to the coordinator as an exact path and minimal bounded question, not resolved with product expansion. There are no open product decisions in this bounded handoff; native review, final independent review and rendered/runtime acceptance are explicitly unfinished gates.

Parent owns final fresh UX/a11y/localization review, then implementation. Later acceptance requires genuine unmet-behavior RED, real components/actions with network-boundary fakes for rights-before-bytes, current raw/earlier-raw leaf/unused support, partial pages beyond old queue cap, full-pair image failures/focus/re-review/clear, B-only no-A-fetch, stale/denied/lost-prepare/lost-execute, same-command retry, reload pending re-entry and concurrent commit, all locales and preserved release inputs. Then affected compilers/lint, real multi-actor protected storage/rights/race/revocation/retention, assembled Standards/Spec, CI and deployed acceptance. No tests, builds, compiler, browser/device, SQL, services or staging were run for this design. This source-only artifact cannot substitute for those receipts.
