# Next-release acceptance matrix, 2026-10-20

Executable preparation for the next Carberk Play release: the existing marketplace plus the full [#897](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897) campaign, delivered only through sole integration [PR #904](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/904). Release scope is in [88 next-release scope](../../prd/ops/88-play-console-submission.md#next-release-scope-founder-direction-2026-10-19). **Nothing here is a pass.** Preparation is not acceptance.

Prepared on base `93f158c367240e3864b924ba36fec49eb3aea7b8` from repository sources only. No tests, builds, browsers, devices, staging, provider, credential or GitHub actions were performed. The host-local plans `/tmp/carberk-campaign-delivery-20261014/{ui-acceptance-execution,native-preparation}-20261018.md` no longer exist. This file replaces them as the plan. Their device launchers and refusal receipts are not reused. The [criterion evidence index](criterion-evidence-index-20261018.md) (**IX**) remains the historical owner of established evidence and named open criteria. This matrix references its rows and does not restate them.

Root reconciled the prerequisites below while candidate `9b2938e1` was under hosted verification. The original preparation statement describes the matrix writer's work only. The linked d397 receipts establish named development assertions; no browser, native or deployed acceptance row is marked complete here.

On base `880a9b21`, Root reconciled the active gates with the founder-approved clean reset/reseed. Gate cells that said `v3+` now name the clean-operator prerequisites (**CO**) below. The earlier gate text and the dated U1 entries are per-SHA history. They remain in this file and in git at `880a9b21` and before, and they stay attached to their own SHAs. A covered named development assertion is not deployed or native acceptance. No row is complete merely because tests pass.

## Fixed inputs and rules

- **Candidate.** One pinned PR #904 SHA after independent review and fixes. Record the exact backend deployment SHA, deployment IDs, the signed Android artifact (versionCode, package `com.auto_tm.ynamly`) and the iOS/dev build used. If a checked input changes (source, contracts, bundle origin, fixture profile or migration), the affected batches run again. Earlier receipts stay attached to their own SHA.
- **Auth.** Use normal HTTP OTP, sessions, TOTP enrollment/elevation and audited grants only. No minted tokens or JWTs, fixed codes, pre-elevated sessions, seeded enrollments, `native-pr-seed` on staging, local Docker or local database proxy. Campaign sign-in codes come only from the protected, exact-request email sink under the verified reservation/candidate binding. The [selected contact-phone contract](../issue-901/full-v3-contact-phone-proof-plan-20261020.md) uses a separate protected synchronous SMS sink. [Exact abf72a0e development evidence](checkpoint-abf72a0e-20261021.md) passes generated Owner contact confirmation and the two carrier/reset cases; operational entry remains closed. In the clean environment the fixed aliases keep these ordinary paths. No minted token, fixed code or seeded TOTP enrollment substitutes for them. Generic mock log reading is insufficient for these campaign paths. Follow [shared staging controls](../../agents/shared-staging-controls.md) and [mobile sessions](../../agents/mobile-expo.md#shared-staging-native-sessions). After a refused or Not Authorized token, stop. Do not retry it and do not substitute another token.
- **Fixture (history; superseded as the acceptance route).** `campaign897-full-v3` owns the developing auth and broad-graph profile. Its CLI/controller/Railway entry points remain **closed**. [Exact abf72a0e evidence](checkpoint-abf72a0e-20261021.md) records 27/31 full-v3 cases passing, including ordinary auth/TOTP/grants, business admission/redemption/membership, coordinator command, contact/carrier races, drafts and Support text/closure/reopening. Inclusive Support retention commits purge but cleanup remains incomplete. Three later media cases stop at issuance400, strongly consistent with retained OTP-budget contamination; this does not erase [232a66c3's named media evidence](checkpoint-232a66c3-20261021.md) or certify it on the newer SHA. Service/payment, diagnostics, measurement, complete worker/private-object coverage and the full roster remain incomplete. Until `880a9b21`, batches marked **needs v3+** waited for these slices. The [clean-acceptance contract](../issue-901/prelaunch-clean-acceptance-contract-20261021.md#4-operational-clauses-superseded-for-this-acceptance-path) supersedes that route, so v3 extension is no longer an acceptance dependency. These development receipts are not deployed or native acceptance.
- **Clean environment (2026-10-21; reconciled at `880a9b21`).** The founder's prelaunch data decision ([#897 plan](https://github.com/Carberk/carberk/issues/897#issuecomment-6314266361)) replaces v3 extension as the acceptance dependency. Its replacement is an exclusive, quiesced and reseeded environment under the [clean-acceptance contract](../issue-901/prelaunch-clean-acceptance-contract-20261021.md). The [reference inventory](../issue-901/prelaunch-reference-inventory-20261021.md) and the [first executable slice](../issue-901/prelaunch-reset-first-executable-slice-20261021.md) define the operation. The [`c253ab93` hosted receipt](../issue-901/prelaunch-hosted-receipt-c253ab93-20261021.md) records several passes: S2A `staging-clean-reset.e2e.spec.ts` 6/6, the Q3 synthetic-center bootstrap 13/13, the Support close/reopen journey, worker 369/369 (which includes the NP-3/NP-4 product assertions first passed on `8f8709aa`) and DB 371/371. These are named development assertions. No reset, reseed, deployment or live read has occurred. The API suite fails only on the three retained reset-tail tests (`CampaignFullV3.e2e.spec.ts:2299`, `:3288` ×2). They stay in place and RED, and they are retired only as the contract states. Joined journeys, ordinary OTP/TOTP/grants, live-feature gates and latest-main restoration below are unchanged.

  | Key | Clean-operator prerequisite | State at `880a9b21` |
  |---|---|---|
  | CO-L | Live staging authority: a working scoped token, verified project/environment/service IDs and origins, rights to set the maintenance and synthetic variables, and a database role able to detach triggers and truncate | The token was refused (U3). Origins and privileges are UNKNOWN. Nothing has been requested |
  | CO-Q | Fresh quiescence proof, including the signed-upload window (OT-QUIESCE) | The observer always refuses with `QUIESCENCE_EVIDENCE_GAP`. The [history/active-job checkpoint](../issue-901/quiescence-history-active-jobs-20261021.md) is progress, not quiescence proof |
  | CO-R | Reviewed clean reset under the exclusive reservation: OT-GUARD/INV/RETRY/RESTART/RESTORE green on the assembled candidate, then authorized execution | S2A 6/6 is development evidence only. No reviewed operation exists. The production executor refuses as not implemented |
  | CO-S | Reference reseed and verification (OT-SEED), including the reviewer App-access reseed; demo inventory only through the reviewed procedure | Not implemented. Seed sufficiency is UNKNOWN |
  | CO-A | Roster actors: the fixed aliases sign in through ordinary email OTP via the protected sink; the coordinator's two grants come from `staff:bootstrap`, every other grant over HTTP in S1; TOTP is enrolled normally; admin comes only through the audited `admin:promote` selector (U2) | The commands exist in source. No executable roster bootstrap or rights authorization exists, and none is assumed |
  | CO-C | Synthetic diagnostic center and qualification through `diagnostics:bootstrap-synthetic` under the staging synthetic gate; `operationalApproval` stays null | 13/13 hosted at `c253ab93`. Never operated |
  | CO-D | ADR-0108 D2/D3 continuity implementation (#914) per the [approved handoff](diagnostic-continuity-approved-implementation-20261021.md) | The policy is decided and the implementation is incomplete. The [identity-history HTTP test](diagnostic-identity-history-red-20261021.md) at `880a9b21` awaits hosted RED. It is not runtime proof |

  **CO** in a gate cell means CO-L, CO-Q, CO-R, CO-S and CO-A. Any additional prerequisite is named separately.
- **Roster.** Use only these fixed aliases (`scripts/staging-campaign.mjs:236`): buyer-a, buyer-b, owner, sales-a, sales-b, coordinator, support, history-fulfiller, payment-verifier, reception-steward, technician, independent-reviewer, private-reviewer, aggregate-viewer, investigator. Bootstrap (`staff:bootstrap` in the clean environment) seeds only coordinator `staff.manage` and `founder.control`. Every other capability ([`staff.ts`](../../../packages/contracts/src/schemas/staff.ts)) is granted over HTTP during S1. Do not invent extra aliases, users or tokens.
- **Excluded.** No spending, real invitations, real SMS, provider purchases, store submission, production promotion or live activation.
- **Launchers.** Rediscover devices and browsers when the run starts: T3 `device_list` then `device_open` (iOS/Android), and `preview_status` then `preview_open` (admin/web). Record the IDs returned. The [Android prerequisite receipt](android-runtime-prerequisite-20261020.md) proves basic boot and responsiveness through a headless launch followed by T3 attachment; the one-step cold-boot path still fails on its camera arguments. Recheck the documented launcher and camera source for the acceptance run. An unavailable platform is missing evidence and does not count as a pass.

## Common state families

Each batch records the states its governing spec mandates, as listed below. It does not re-list them.

| Key | States | Mandated by |
|---|---|---|
| **Ld** | loading, empty, valid zero, error with retry | all specs below |
| **Dn** | denied, stale session/grant, revoked mid-task, direct-URL/file refusal | [40 campaign](../../prd/features/40-admin.md#approved-service-and-bounded-admin-campaign-2026-10-14), [38](../../prd/features/38-showroom.md#executable-acceptance), [53](../../prd/features/53-vehicle-history.md#verification-and-activation), [50](../../prd/features/50-reports-tier.md#failure-and-acceptance-criteria) |
| **Rc** | interruption/reopen, retry, lost response, server state wins | [video](../../prd/ui/hifi/mobile-listing-video.md), [68](../../prd/flows/68-service-requests.md#acceptance-scenarios), [66](../../prd/flows/66-diagnostic-inspection.md#failure-and-recovery-examples) |
| **Lc** | TK/RU/EN including errors/exports, locale switch keeps context, keyboard/focus, narrow/tablet | [service workspace](../../prd/ui/service-workspace.md#accessibility-localization-and-state-coverage), [40 analytics](../../prd/features/40-admin.md#approved-analytics-campaign-addition) |
| **Th** | light/dark theme, text scale, accessible labels (native) | [38 D7](../../prd/features/38-showroom.md#executable-acceptance), [72](../../prd/ui/72-light-and-dark.md), [77](../../prd/ui/77-accessibility.md) |

Run **Lc** and **Th** once per surface, in the batch that first reaches it. Later batches reuse that capture only when the build, route and fixture state are exactly the same.

## Execution lanes and batches

Each batch row gives its preconditions, a trigger with its observable result, the artifact required, and the gate/owner. Artifacts go to the PR #904 acceptance record with candidate SHA, platform/device ID, locale/theme and timestamp. **Gate** says what blocks execution today. **Owner** is the Root integration owner unless stated otherwise.

### S. Setup and staff authority (#900, #906) — IX rows #900, #901, #906

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| S0 | Reservation recorded; Railway identity verified | `/readyz`, worker boot, media readiness, mock delivery config; bundle API/socket/media origins match staging | deployment IDs and SHA, readiness receipt, origin receipt | CO-L (scoped staging token refused before); CO-Q, CO-R |
| S1 | admin `login` → `workspace`; coordinator; browser | ordinary email OTP sign-in, TOTP enroll and elevate, coordinator grants each capability to its explicitly allocated alias with a reason, including public independent-reviewer reception/templates/reviewer under mapping D; self-grant refused; no temporary management delegation | audit rows (redacted), screenshots **Dn Lc** | CO |
| S2 | S1 actors | each alias reaches only areas authorized by its explicit grants, including mapping D; every area outside those grants is denied; revoke one grant mid-task → next direct read/mutation/file URL refused; stale elevation expires | HTTP status and screen pairs | CO |
| S3 | admin shell/viewers ([#906 evidence](../issue-906/verification.md)) | listing/user directory, full read-only viewer, protected video context; desktop, narrow and tablet; keyboard-only path | screenshots **Lc** | CO |

### M. Existing marketplace (must stay intact)

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| M1 | mobile `(auth)/phone`, `(auth)/email`, `(auth)/otp`; buyer-a | email OTP sign-in, wrong code, then lockout copy ([otp flow](../../prd/ui/hifi/mobile-otp-login-flow.md)); phone sign-in only with mock SMS, no real SMS | screenshots **Ld Th** | CO |
| M2 | `(tabs)/(search)/*`, `(public)/listings/[id]`; signed out and buyer-a | Home → brand/model → parameters → results → detail; sort and filter keep scroll on Back ([33](../../prd/features/33-search-discovery.md)) | screenshots **Ld Lc Th** | CO (demo inventory under reservation) |
| M3 | `(tabs)/sell`, `listings/[id]/edit`, `listings/manage`; sales-a personal | create with required photos, publish, edit, archive ([wizard hifi](../../prd/ui/hifi/mobile-create-listing-wizard.md)) | screenshots **Rc** | CO |
| M4 | `conversations/*`, `(tabs)/chat`; buyer-a ↔ sales-a, two devices | send, receive in realtime, push on the background device, mute/report ([34](../../prd/features/34-conversations.md), [36](../../prd/features/36-notifications.md)) | screenshots plus push receipt | CO; push needs a Firebase-capable build |
| M5 | `profile`, `account/*`; buyer-b | display name, add email/phone, profile photo, delete account → scheduled | screenshots | CO |
| M6 | admin `(admin)/listings`, `reports`, `users`, `audit` | moderate a reported Listing and a profile photo ([65](../../prd/flows/65-admin-moderation.md), [runbook](../../prd/ops/80-deployment-runbook.md#reported-profile-photo-moderation)); action audited | screenshots plus audit row | **unavailable actor**, see U2 |
| M7 | web `[locale]/legal/*`, `trust`, `account/delete`; mobile `about`, `help` | each page renders in TK/RU/EN; legal links open from the app | screenshots **Lc** | none beyond S0 |
| M8 | carried [#758](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/758); Android release build; buyer-b | D5: fail profile upload on a throttled network → Log out → Cancel → restore → one Retry succeeds without restart; also font/display-size recreation. D14: progress is measured or indeterminate, never 0→100 ([758 evidence](../issue-758/verification.md), [pass-2](../release-emulator-pass-2/report.md)) | logcat excerpt plus screenshots | Android launcher; CO |
| M9 | carried [#486](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/486); Hermes release bundle; RU | parameters count copy at 0, 5 and 21 matches; invalid→valid filter shows no stale count; City copy | screenshots | source reconciled from closed PR557; native release proof outstanding ([record](search486-release-reconciliation-20261020.md)) |

### V. Views and native video (#874, #899, #886, #888–896) — IX rows and #886 table

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| V1 | detail on rebuilt native; views enabled, then disabled | dwell on full detail counts once per the eligibility rules; disabled build sends nothing | native request log plus API count | collection/disclosure stays closed (HF) |
| V2 | worker under reservation | retention sweep: last-success, backlog, oldest-overdue; restart worker and recover | worker receipt | CO |
| V3 | `(tabs)/sell` video slot, sales-a; iOS and Android each | library-only pick; permission denied keeps fields and photos; >90 s forces interval; trim handles; poster crop ([video hifi](../../prd/ui/hifi/mobile-listing-video.md#seller-media)) | screenshots for each required state | tester rollout eligibility; CO |
| V4 | V3 selection | Preparing → Uploading → Pause stays paused over reconnect and reopen → Continue → Processing; Cancel; unsupported/storage/expired authority → Retry, another video, Remove; never upload the original | screenshots plus server session state | CO; private bucket (U5) |
| V5 | published with pending/failed video | required photos publish while optional video is pending/failed; replacement keeps the ready video until the new one is ready; Remove hides it at once | screenshots plus public API projection | same |
| V6 | buyer-b, Results → detail → gallery | poster-only arrival, no prefetch; Play opens the player with sound/pause/seek/mute/fullscreen/quality; Data saver ≤360p; buffering/error; Close returns to origin; background stops fetching ([buyer media](../../prd/ui/hifi/mobile-listing-video.md#buyer-media)) | screenshots plus network log | same |
| V7 | admin listing viewer; protected video | moderation hides and revokes access; cleanup leaves no orphan parts/objects; account purge removes owned video | storage listing receipt | CO; deployed worker binary |
| V8 | resources | measured CPU/memory/concurrency against the provisional 15 MiB, 10 min and 2 GiB caps | resource snapshot | HF (founder samples) |

### B. Business (#902, #908–910) — [38](../../prd/features/38-showroom.md#executable-acceptance) D1–D7, [67](../../prd/flows/67-dealer-workspace-and-sharing.md)

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| B1 | admin `business-admission`; support holds `founder.admission`; owner | admit a synthetic business; owner redeems; wrong-account, expired, revoked or duplicate invitation refused (D1); no real invitation sent | screenshots plus audit | CO |
| B2 | mobile `business`, account switcher; owner, sales-a, sales-b | personal ↔ business context is explicit; revoked member keeps saved drafts but cannot publish (D2) | screenshots **Dn** | CO |
| B3 | `business-inventory`; sales-a | create, resume, contact proof, publish, adopt media; creator removed → stock survives (D3) | screenshots | CO |
| B4 | `business-enquiries`; buyer-a → business | concurrent claim has one winner; reassign; removal revokes HTTP, socket, push and private images (D4) | two-device screenshots plus 403 receipts | CO; private bucket (U5) |
| B5 | web `showrooms/[id]`, `listings/[id]`; signed out | suspension/sold/removed lifecycle and cache metadata agree; share links with app installed and not installed (D5–D6); `MARKETPLACE_LINKS_VERIFIED` stays false | screenshots plus response headers | HF (signing identities) |
| B6 | B1–B5 surfaces | **Lc Th** pass (D7) | screenshots | as above |

### C. Support and Vehicle History (#903, #911–913) — [68](../../prd/flows/68-service-requests.md#acceptance-scenarios), [54](../../prd/features/54-support.md#acceptance-and-activation), [53](../../prd/features/53-vehicle-history.md#verification-and-activation), [workspace](../../prd/ui/service-workspace.md)

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| C1 | mobile `services`, `(tabs)/services`; buyer-a; admin `(admin)/services`; support | signed-out entry refused; restricted-user appeal; image send/retry; reply vs private note; close/reopen; staffed-clock label | screenshots **Ld Lc** | CO |
| C2 | buyer-a → History; history-fulfiller, payment-verifier | VIN quote, two-hour hold, late receipt, FIFO/capacity, claim/handover (previous operator refused at the endpoint), PDF failure → recovery → refund state | screenshots plus HTTP pairs | CO with controlled seeded capacity; payment stays simulated |
| C3 | buyer-a, buyer-b | protected PDF/artifact opens, saves and shares natively; archive reuse never shows the earlier purchaser; direct artifact URL denied to buyer-b | screenshots plus 403 | CO; private bucket (U5) |
| C4 | admin service workspace mid-edit | break the browser-to-Next RPC (stop network) → recovery copy, draft kept, no duplicate send ([H](../campaign-897/history-ui-fixes-20261018.md)) | screenshots plus network log | browser launcher; CO |
| C5 | buyer-a → buyer-b account switch on one device | drafts and caches of A are not visible to B ([review round 2](review-round2-service-isolation-20261018.md)) | screenshots | CO |
| C6 | account deletion; closed case | purge and storage cleanup; reopen/purge race behaves as specified | DB/storage receipt | CO |

### X. Diagnostics (#907, #914–916) — [66](../../prd/flows/66-diagnostic-inspection.md#evidence-expected-before-launch), [50](../../prd/features/50-reports-tier.md#failure-and-acceptance-criteria)

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| X1 | mobile `diagnostics/*`; buyer-a and owner; reception-steward for private X1, independent-reviewer for public reception/templates, in admin `diagnostics` | intake with physical vs publication consent; requested time not shown as confirmed; duplicate request does not double-book | screenshots | CO, CO-C |
| X2 | technician | checklist, body map ↔ list equivalence, evidence retry, unsaved-work guard; removed technician refused | screenshots **Dn Rc** | CO, CO-C |
| X3 | independent-reviewer (public reception/templates/reviewer, current center qualifications, different from technician author; may self-assign reviewer capability), private-reviewer (unchanged audited self-review) | release immutable v1; correction creates v2 with v1 kept; withdrawal hides public; template v2 does not alter v1 | audit plus reader screenshots | CO, CO-C, CO-D for successor/reinspection continuity |
| X4 | web `[locale]/diagnostics/[id]`, mobile reader; buyer-b and outsider | reader and PDF from the same snapshot in TK/RU/EN; private report invisible to seller and buyer-b; badge on Results and detail only for available public reports | screenshots plus PDF hash | CO, CO-C |

### A. Measurement and Improvement (#905, #917, #918) — [analytics UI](../../prd/ui/analytics-improvement.md), [D](dealer-measurement-criterion-reconciliation.md)

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| A1 | admin `improvement`; aggregate-viewer, investigator | fixed-week scorecard, Today freshness only; suppressed vs unavailable vs zero distinct; investigator drawer requires a reason and is audited; aggregate-viewer is denied investigation | screenshots **Ld Dn Lc** | CO; synthetic events created in the clean environment; **collection closed** |
| A2 | revoke/restore and rights | revocation, erasure and restore reflected in the scorecard and in an export; market panel keeps source restriction | export file plus audit | CO |
| A3 | native offline/account switch | measurement queue erased on sign-out/guest erasure; core journeys work with telemetry down | screenshots plus queue state | CO; native |

### O. Operations (#919, #920) — IX rows #919, #920; [runbook alerts](../../prd/ops/80-deployment-runbook.md#operational-monitoring-alerts)

| ID | Preconditions | Trigger → observable | Artifact | Gate |
|---|---|---|---|---|
| O1 | admin `operations`; deployed watchdog | stop the collector → independent watchdog raises an alert → recovery alert | alert IDs plus timestamps | independent topology; reservation |
| O2 | named recipient inbox | alert arrives and is acknowledged by a human | inbox screenshot plus ack record | HF (recipient) |
| O3 | billing/resources | fresh limits; DB/media restore with checksums and replay; core journeys afterwards | resource and restore receipts | HF plus provider |

## Human activation facts (HF; not software acceptance)

These never pass through synthetic runs. Record each fact as present, absent or not required for the release, together with the person accountable.

| Fact | Owner |
|---|---|
| Real business admission facts, invitation transport | founder |
| History provider/supplier, payment/refund process, morning capacity | founder |
| Diagnostic center approval, qualified reviewers, price/capacity | founder |
| Support staffing 09:00–20:00 Asia/Ashgabat, escalation | founder |
| Legal basis/disclosures for views, measurement, market data; source redistribution rights | founder/legal |
| Founder physical Full HD 60 fps / 4K 60 fps / HDR recordings | founder |
| Signing identities, assetlinks/AASA, Play disclosures, versionCode, [#329](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/329) signed-candidate gate | founder |
| TM provider/storage/network/hardware facts | founder |

Mapping D is acceptance actor allocation only, with no governing scope change. [The capacity disposition](../issue-901/full-v3-diagnostics-capacity-disposition-20261021.md#root-disposition-mapping-d-adopted) records D ≥121 as a lower bound, not complete fit. Template size/full evidence/reinspection/bootstrap audit and storage counts remain UNKNOWN. Qualification authority rejects null/expired validity; center/bootstrap/runtime/disposal architecture remains UNAPPROVED. Whole acceptance criteria remain required. [The 46f9ab8a checkpoint](checkpoint-46f9ab8a-20261021.md) records hosted RED media and reinspection; this candidate is not green.

## Unresolved prerequisites

Dated U1 entries are per-SHA history. The current state is **U1 current** at the end of this section, together with the CO table.

- **U1.** Operational full-v3 entry points remain closed. Named auth/business/contact/Support development assertions in the exact receipts above do not complete the full roster/capability matrix or their native/deployed rows. Service/payment, diagnostics, measurement, complete media/worker/private-object disposal and expiry/refusal coverage remain incomplete. The [capacity inventory and root disposition](../issue-901/full-v3-capacity-inventory-20261020.md) permit independent acceptance groups without dropping any selected capability or required joined journey. Caps remain128/2048. Most acceptance batches remain blocked on these gaps.
- **U1 latest development update, October 21.** [Exact abf72a0e evidence](checkpoint-abf72a0e-20261021.md) advances retention beyond the prior guard refusal: purge commits, then cleanup fails with the original worker error hidden by the rollback assertion. A pending empty fence blocks exact reset. Exact67/99, completed cleanup, foreign preservation after purge and reset/retry remain unproved. Later media issuance400s strongly fit retained OTP-budget contamination; response categories are not yet captured and both media timing arrays are empty. Attach c7 passed initial setup. Three additive Support due/reopen/reset proofs and bounded failure diagnostics form the next held batch. The [selected durable worker resolver](../issue-901/full-v3-support-worker-resolver-selection-20261021.md) remains an implementation boundary with incomplete hosted acceptance. Reinspection remains404. No acceptance row is complete from this update.
- **U1 clean-acceptance update, October 21.** The three a43ee64e failures (`CampaignFullV3.e2e.spec.ts:2299`, both `:3288`) remain RED. The [clean-acceptance contract](../issue-901/prelaunch-clean-acceptance-contract-20261021.md) retires their operator-reset tails only after NP-3/NP-4 and OT-QUIESCE are green; their product invariants stay.
- **U1 current (`880a9b21`).** v3 extension is no longer the acceptance route. The blockers are CO-L, CO-Q, CO-R, CO-S and CO-A, plus CO-C/CO-D for diagnostics and U5 for private storage. Product coverage gaps in service/payment, diagnostics, measurement and media/worker disposal now map to the contract's named product tests and deployed rows. A covered status there is assertion-only and does not complete any row. The three reset-tail tests stay RED and are neither retired nor weakened. No readiness is claimed.
- **U2 development admission verified; operation still gated.** The [moderation prerequisite decision](../issue-901/full-v3-moderation-actor-decision-20261020.md) selects the existing coordinator through the audited operator command's verified-email selector. All 11 actual-command tests pass on d397, including selector, atomic audit/role rollback and concurrent phone/email promotion. The [coordinator tests](../issue-901/full-v3-coordinator-promotion-test-handoff-20261020.md) now pass on [232a66c3](checkpoint-232a66c3-20261021.md), including v3 reservation admission, current-candidate refusal, role/audit reconciliation, cleaning/disposal refusal and retryable reset. No operational promotion occurred; M6 still has no usable staging actor. Independent review and authorized staging operation remain outstanding. Do not seed admin privilege, invent an alias or substitute a staff capability for the current admin role.
- **U3.** The scoped staging token was refused, and the authoritative origins are unverified.
- **U4 basic Android runtime established.** The [prerequisite receipt](android-runtime-prerequisite-20261020.md) records successful boot, scoped CLI responsiveness and cleanup, with a cold-boot launcher limitation. Candidate installation, app behavior and camera input remain unproven. iOS needs an app session before snapshots.
- **U5.** The private bucket and the remediation of historical public objects (#909) are not provisioned.
- **U6 resolved in source.** PR557 is closed and its required changes are present in the candidate. [Reconciliation](search486-release-reconciliation-20261020.md) establishes source presence only; M9 native release proof remains required.

## Staging sequence

The procedure follows [shared staging](../../agents/shared-staging.md) and the [runbook](../../prd/ops/80-deployment-runbook.md#integration-acceptance-transition). Durable records live in the PR #904 body acceptance record and the reservation ledger entry.

1. **Reserve.** Record a durable reservation: parent #897, PR #904, owner, candidate SHA, purpose, IDs, recovery action.
2. **Identify.** Verify Railway project/environment/service IDs and credential scope; refuse production or ambiguity. Record the current deployment IDs and SHA, then run S0.
3. **Accept.** Run the batches in the order below. On failure, keep the reservation, fix on the integration branch, then rerun the affected repository checks and batches.
4. **Reset cleanly.** Between independent groups and before restoration, run the reviewed clean reset under the same reservation and candidate: quiesce (including the signed-upload window), delete inventoried state, migrate, reseed and verify ([clean-acceptance contract](../issue-901/prelaunch-clean-acceptance-contract-20261021.md) §3). On a lost response, continue only the same recorded operation. Until that procedure is reviewed and proved, no acceptance reset is available.
5. **Restore.** Restore the latest fetched `main` (not the reservation base). Verify the deployment SHA, `/readyz` and the fixture/data disposition.
6. **Release.** Mark the reservation released only after step 5 is verified. Stop owned Metro and device sessions before restoration.

## Execution order

1. Pre-staging, no reservation: confirm the candidate CI is green; build the signed Android and iOS dev artifacts from the candidate; rediscover launchers.
2. S0 → S1 → S2 per reservation. Reuse auth and grants inside each joined acceptance group. Independent groups may use separate reservations, each with the reviewed clean reset/reseed and restoration. Record every required alias/capability and denial case across the complete run. Keep related ownership journeys and cross-role/account-switch checks together where their criteria require it; splitting cannot remove coverage. Foreign-reservation preservation is retired under the exclusive reservation; cross-account and cross-business negatives are created inside the clean environment. The capacity inventory identifies required joined groups and unresolved content counts.
3. Batch by actor and device so each signs in once. Mobile buyer/seller: M1–M5, M7–M9, V1, V3–V6, B2–B5, C1–C3, C5, X1, X4, A3. Admin browser: S3, M6, B1, C1 (operator), C2, C4, X2, X3, A1, A2, O1.
4. Run the worker/resource and cleanup checks (V2, V7, V8, C6, O3), then **Lc/Th** sweeps for surfaces still missing them.
5. Reset → restore → release. Human facts are collected in parallel and are never blocked on staging.

## Halt and recovery

Halt the current lane on any of these: unknown or ambiguous environment identity; a refused token; an unexpected 5xx in auth; a reset that reports anything other than exact disposal; or a device or launcher that does not respond. Keep the reservation, evidence and refs. Record the last confirmed step and the next owner. Do not broaden the reset beyond its inventory, delete by pattern, reseed outside the reviewed clean procedure, switch to a local or Docker substitute, or retry a refused credential. The same root failure gets at most three focused repairs ([workflow](../../agents/coding-workflow.md#stop-and-recover)). Unknown disposal leaves the reservation **blocked** until Root inspects identity, deployment, processes and ledger state.
