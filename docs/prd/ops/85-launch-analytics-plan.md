# 85 - First-party product measurement and pilot scorecard

Approved target for the Chief of Staff campaign #897, reusing analytics parent #602. Founder-approved scope and prototype choices are recorded in the 2026-10-14 campaign decisions and governing ADRs. Source, tests and deployed evidence establish implementation status.

## Purpose and phase boundary

Answer whether buyers find Listings, sellers publish, contacts result in accepted Messages and seller replies, users return, and technical failures prevent those actions. Product measurement stays first-party under ADR-0023. Self-hosted GlitchTip owns diagnostics; its SDK is not permission for third-party product analytics.

First Google Play reviewer submission remains Railway-only, without GlitchTip, the admin scorecard or TM VPS. This campaign implements and verifies monitoring on Railway after submission. Before real-user invitations, require core measurement and diagnostics evidence, applicable collection/disclosure readiness, regional delivery evidence, alert receipt and the incident drill. TM purchase/provisioning and actual cutover are separate human-authorized actions. Google Play approval alone does not pass cutover readiness.

The initial app pilot is 20 invited Ashgabat users, aiming for ten sellers and ten buyers; 50 total and Mary follow the exact accepted gates in [84](84-launch-plan.md#invited-pilot-checklist-and-expansion). Canonical rollout sequencing depends on the proposed scoped ADR-0037 amendment and the pilot analytics exception to ADR-0027 in ADR-0102. This specification does not authorize invitations. ADR-0057 continues to defer in-app inspection-demand prompts. Broad moderation/Support/dealer/report expansion stays with owning discovery and issues.

## Shared contract and ownership

One validated event contract serves the app and feature campaigns. Packages/contracts owns schema names/versioning; API ingress owns envelope validation, actor authorization, durable deduplication and collection eligibility; worker jobs own retention/deletion and reproducible rollups; each source feature owns meaningful emission at its outcome boundary; admin owns permission-enforced queries and presentation. These are proposed implementation assignments within ADR-0023, not a new independent analytics platform or bounded context.

Mobile foreground actions and guest visits are client facts. Conversation creation, accepted Message, publication, public visibility transitions and durable seller reply are server facts. Emit only after authoritative commit, with an outbox or equivalent retry-safe approach that cannot misreport a rolled-back transaction. Client/server must not both count the same outcome. For the reply metric, qualify the chronologically first committed non-deleted buyer Message in a newly created eligible buyer-to-Listing-owner Conversation, excluding owner/test conversion. Rejects/local pending/retries do not qualify until accepted; duplicate commit/event delivery counts once. A seller reply is the first subsequent committed Message by that Listing's seller within 24 elapsed hours. Opening an existing Conversation does not create another contact-start or first-Message cohort. Reply eligibility belongs to the first-Message cohort, not every buyer Message. An internal domain event carrying Message content must never be forwarded wholesale.

## Event families

Exact stable names and schema fields become the contracts implementation's reviewed manifest. Each field needs a metric or reliability purpose. These families define the accepted outcome coverage; names below are the draft contract.

| Events | Owner and qualifying fact |
|---|---|
| visit_started, foreground_activity | Mobile/web; foreground qualifying action, not background retry |
| discovery_opened, search_completed, listing_detail_opened | Feature client; rendered result, result-count category and catalog filters, no entered free text |
| sign_in_started, sign_in_result | Identity; start correlation plus accepted/expected rejection/technical failure, no method value or code |
| draft_started, wizard_step_opened, wizard_step_result | Listings client; stable draft correlation; canonical vehicle/specs/photos/price/location/contact/review identifiers |
| media_preparation_result, media_upload_result | Upload owner; attempt/result/category/duration, distinct photo/video kind, no media/path/URL |
| listing_published, listing_visibility_changed | Listings server; committed outcome and public eligibility interval |
| call_intent | Client; genuine enabled Call action; intent only |
| conversation_created | Conversations server; newly committed Conversation only |
| first_buyer_message_accepted, seller_first_reply | Conversations server; first accepted eligible buyer Message and first seller reply to it; no text or attachment |
| video_processing_result, video_playback_result | Worker/player; processing identifies exactly one owning Listing or Draft with `listingId` or `draftId`, plus job/attempt correlation. Playback identifies its Listing and playback attempt. Preparation/upload/processing/playback stay distinct |
| diagnostic/health signals | Diagnostics contract in 81; not product autocapture |

Video instrumentation follows ADR-0099's phase and access restrictions. Tester video can prove collection/reliability without counting as real marketplace conversion. Dealer/report event additions wait for their accepted scopes. Existing public Listing views work #874 remains separately owned; shared measurement must reconcile semantics without taking ownership or exposing private analytics publicly.

## Envelope and field boundary

A versioned envelope contains random eventId, known eventName, occurredAt/receivedAt, environment, release/build, trusted population classification, visit correlation and an allowlisted typed payload. The server supplies authenticated actor pseudonym rather than trusting a submitted accountId or role. Guest installation pseudonyms are opaque random app-scoped IDs. Event IDs prevent repeat receipt from creating repeat facts. Outcome attempt IDs separate retries from successful actions.

Allowed contextual fields are approved app/OS version, coarse device model, locale, connection type, named screen/action, duration/result/category, catalog IDs and bounded structured filters. Listing city describes the marketplace, not physical user location. Reject unknown names, versions, keys, unbounded strings, arrays and implausible timestamps. Whitelist route templates, not raw URLs; query strings and signed URLs never enter telemetry. No chat text, media, contact values, passwords, OTPs, tokens, precise location, advertising IDs, contacts, keystrokes, replay, autocapture or fingerprinting. Do not retain raw search text. SDK-generated breadcrumbs/context require the same scrutiny; a field allowlist alone is insufficient.

Reviewer/demo/test population is trusted server/config metadata, never a client-selectable escape from controls. Test reliability evidence is visible separately. Exclude known owner interactions from conversion; do not infer guest ownership or remove real marketplace activity simply because an actor is also an admin.

## Identity, collection and rights

Guest pseudonym continuity lasts at most 90 days and visits reset after 30 minutes without foreground activity. Sign-in associates only the current guest visit, never earlier guest visits. Signed-in measurement uses a separate pseudonym; logout/account switch separates associations. Accounts and guest installations are not unique people and must not be summed.

The founder prefers broad useful collection, default-on where permitted, with clear explanation of collected data and improvement purposes in Terms and privacy disclosures. Provide only the rights/controls required by applicable law and store policy; do not add a blanket optional-analytics toggle without an identified requirement or founder decision. This preference is subject to a documented applicable collection basis and required rights. Do not treat ordinary sign-in Terms agreement as guest telemetry consent. Before collection in an admitted phase, complete its purpose, lawful-basis, storage/transfer, retention, notice and rights matrix. Operational/security diagnostics require their own basis and minimal fields. Unresolved longitudinal collection remains disabled for that region/population. Language, citizenship, IP-derived assumptions or Listing city do not prove eligibility or physical region. A region-selection/enforcement mechanism is an explicit remaining design decision if applicability cannot be established.

On account-deletion request, immediately stop account-linked collection, purge linked raw product/diagnostic history and identity associations, and reject queued/late account-linked events. The core account's 30-day recovery period does not preserve analytics history. Recovery of a core account does not restore prior telemetry. Guest deletion/withdrawal rights require a usable guest-safe mechanism wherever applicable. Non-identifying aggregates may survive only after disclosure-risk review. Avoid keeping analytics identity mappings in account tombstones; choose and prove a deletion fence that also handles old app queues and backup restores.

## Delivery and resource defaults for engineering review

Telemetry never blocks browse, auth, upload/publication or chat. Core transactions do not wait for collector availability. Proposed bounded client queue: seven-day maximum age, 2 MiB or 1,000 events whichever comes first; batches no larger than 50 events or 128 KiB; drop expired/oldest product events with aggregate drop reasons; separate bounded crash handling. These are implementation proposals, not additional approved collection.

Retry transient failure using exponential backoff with jitter, starting at five seconds and capped at one hour; honor Retry-After, retry only eligible transient/network failures, stop permanent schema/authorization failures and cap queue age. Recheck eligibility before enqueue and flush. Clearing/withdrawal/logout/delete must prevent old actor events reaching a new actor. Foreground resumes may schedule delivery but do not block the UI. Never store tokens in event envelopes or diagnostic artifacts.

Proposed ingress defaults: authenticated normal user session for account events, scoped guest installation capability for guest events, separate service authorization for server emission, global/per-installation/per-account limits, body/field/time bounds, durable event-ID dedupe and explicit rejected/dropped counters. Guest credentials confer no other app privileges. Exact rate values follow measured pilot resource testing; changing collection semantics requires founder review. Raw IPs used transiently for abuse controls are not product event fields.

Raw product events expire after 90 days; individual diagnostics after 30 days; routine product and diagnostic aggregates after 24 months. The explicitly qualified durable anonymous market-data class below is a scoped exception to the earlier blanket 24-month aggregate limit. Telemetry is excluded from year-long core archives. Daily retention sweep reports lag and failures. Restore replays applicable deletion fences before data is served or collection resumes. Performance/resource caps protect core services during a diagnostic storm. 81 owns actual cap sizing and evidence.


## Durable vehicle and market knowledge

Governed by proposed [ADR-0107](../../adr/0107-durable-permitted-vehicle-market-knowledge.md); effective after the scoped decision merges.

The final founder objective is a durable Turkmenistan vehicle-market dataset and lawful commercial anonymized insights. Names and identifiable contact/customer records are not the commercial product. This campaign delivers data foundations, provenance and controlled derivation, not a sales portal, buyer access or an actual sale/disclosure.

This is an explicit scoped amendment to the previous blanket 24-month aggregate planning limit. A separately registered class of genuinely anonymized, lawfully reusable vehicle/market observations and business statistics may be retained indefinitely where rights and applicable obligations allow. Retain for the longest justified permitted period if indefinite retention is unavailable. Routine diagnostic/release aggregates and ordinary product scorecard aggregates remain 24 months. Raw product events remain 90 days and individual diagnostics 30 days. No extension applies merely because a row is called an aggregate, an ID is hashed, a VIN is masked or names are absent. Accepted ADR-0023 keeps its first-party architecture and raw-data exclusions; this adds only the bounded permitted business-derived purpose/class.

Each admitted durable dataset has an owner, source/version/provenance, purpose, permitted reuse and commercial redistribution rights, retention class, applicable destinations, identifiability assessment, derivation/suppression version and review date. Store the assessment without carrying raw actor mappings into the durable dataset. A registry entry that lacks adequate rights or anonymization evidence remains quarantined and cannot be treated as indefinite or exportable. Provider licenses may restrict even derived resale, not just copied PDFs; do not infer redistribution rights from purchase or source availability.

Separate raw account-linked records, private conversations/payment evidence, buyer-private reports and supplier documents from permitted vehicle knowledge. No private-report existence or findings may leak through public vehicle records, tiny market groups or commercial extracts. VIN, rare vehicle combinations, precise mileage/date histories and stable pseudonyms can enable singling out or linkage. Exclude or generalize identifiers, event-level histories and rare combinations as required by the risk assessment. Anonymization must resist reasonable linkage, subtraction and repeated/filter-combined queries. The existing below-five rule is a starting safeguard, not an anonymization certificate. Aggregates must not retain reverse mapping tables or per-person contribution exports. Permission for public report viewing does not automatically authorize unrestricted commercial reuse.

Optional self-reported age bands and coarse residence city/region may be useful only for a named metric/purpose with documented basis, notices, rights and minimization before collection. Default is unknown/unprovided. Never require demographics to browse, buy or publish, infer age from photos/messages, collect exact birth date/address/continuous precise location to compute bands, or silently repurpose selected search/Listing city as residence. Mark self-reported residence separately from market location, including unknown and outdated values. Do not introduce minors targeting or expanded sensitive attributes. Age-related eligibility and any youth protections must be assessed before enabling demographic collection.

Raw demographic fields remain personal without names. Keep them purpose-bound, restricted and subject to deletion/correction and an explicitly justified shortest permitted retention; do not add them to the 90-day event envelope by default or assume indefinite profile storage. Exact band taxonomy and any account-profile persistence are technical/product proposals under the named research purpose, not authorization to collect live data. Use synthetic age-band/coarse-region fixtures until the field contract and applicability checkpoint are approved. At account deletion/withdrawal, stop collection and remove linked fields/queues/eligible raw history. Anonymous output survives only if it is genuinely non-identifying and lawfully retained; identified, reversible or restricted derivatives must be corrected, erased or recomputed under their obligations.

Commercial export stays off. Before any real disclosure, record authorized recipient/purpose, license and regional obligations, a fresh reidentification/reuse review, minimum-cell/composition controls, permitted schema and approval. Administrative investigative exports remain a separate restricted purpose and cannot become raw commercial datasets. Reassess durable-class safety when new fields/linkage sources or supplier restrictions change. A deletion/restriction finding blocks affected extracts and triggers removal or safe rederivation, including serving copies/backups as applicable.

Acceptance uses synthetic fixtures: direct and hashed actor IDs/VINs cannot enter anonymous outputs; tiny/combinable cells and buyer-private facts are suppressed; rights-restricted provider rows stay excluded; routine aggregates expire at 24 months while only qualified anonymous market classes survive; deleting raw actors purges personal sources and reversible derivatives without resurrecting data on restore; optional unknown demographics remain usable and no required marketplace action demands them. No real data collection, legal certification, paid-provider rights or commercial disclosure is established by these tests.

## Metric definitions and acceptance fixtures

| Metric | Definition and literal acceptance fixture |
|---|---|
| Discovery/search/detail | Fixture of 3 foreground discovery opens, 2 completed searches with 8 and 0 results, 4 rendered eligible detail opens plus duplicate deliveries => 3/2/4; zero-result rate 1/2. Technical failed search adds a failure signal, not a completed search. Owner/test detail events are excluded from conversion fixtures; reliability remains separately visible. |
| First accepted Message | Three new eligible Conversations: one buyer Message accepted twice by retry/delivery, one rejected then accepted, one never accepted => 3 starts, 2 first accepted Messages. Opening an existing Conversation adds no start/cohort; owner/test cases add no conversion. |
| Contacts per active Listing | 11 distinct Call intents + 5 committed new Conversations = 16 contacts; 12 time-weighted average publicly active Listings => 1.3333; 14 current active shown separately. No active inventory => not applicable, not zero conversion. |
| Call intent | Once per account/guest installation, Listing, UTC day. Three taps by same unit/Listing/day count one; another UTC day counts another. No completed-call/sales claim. |
| Chat start | New Conversation commit counts one; five opens of that Conversation count zero additional starts. First accepted Message shown separately. |
| Seller publication | 7 of 18 eligible draft starts publish within seven days => 38.9%; incomplete windows withheld. Seven-day metric does not expire drafts. Upload retries are attempts, not new drafts. |
| Seller response | 4 of 5 eligible first accepted buyer Messages get a seller reply within 24 hours => 80%; also show response-time distribution. Open windows excluded until matured. No seller deadline. |
| Sign-in | 21 successful sign-ins of 22 eligible starts => 95.5%; technical transport failures and expected incorrect/expired-code outcomes distinct. |
| Upload | 15 completed of 20 attempts => 75%; five failed attempts do not establish five affected people or five abandoned drafts. |
| Returns | Separate first-observed account and guest cohorts. D1/D7/D30 mean exact next/seventh/thirtieth UTC calendar day. Matured account fixture 6/12 D1 and 4/12 D7; guest 3/8 and 2/8. Unmatured D30 unavailable. |
| Reliability | Controlled failure/receipt fixtures in 81; genuine errors can be investigated immediately even when product sample sizes are small. |

Public visibility history supplies time-weighted inventory, not end-of-period snapshots. Public eligibility requires active and actually publicly visible; drafts, banned/hidden, archived/sold and deleted states are excluded. Literal 24-hour interval fixture: Listing A active all 24 hours; B active for hours 0-6, hidden for 6-18, restored for 18-24; C draft until hour 12, active for 12-18, archived afterward. Total eligible 42 Listing-hours / 24 hours = 1.75 average active, current active at period end = 2. Duplicate/out-of-order interval facts must still yield 1.75 and must not count the hidden/draft/archived periods. Ensure delayed and duplicate visibility events cannot create overlaps or negative intervals. Date filters use complete UTC days. Collection watermark/late-event policy must make completeness reproducible; proposed pilot allowance is 24 hours after day end, with older late arrivals tracked and recomputation/version shown. Observation maturity and collection completeness are separate checks.

Combine groups below five measured accounts/installations and assess combinations/filter leakage. Rates below 30 eligible starts display counts and small-sample labels, subject to grouping; this is not a significance claim. No identity count in a tiny suppressed group. Data unavailable is not zero; delayed collection withholds comparisons; matured empty data is distinct. No product-growth rule gains automatic pause/rollback authority.

## Approved admin interaction

One Improvement area has Overview first, Journeys & returns, Reliability & fixes. All admin and analytics workspaces support Turkmen, Russian and English, including navigation, screens, charts, filters, forms, validation, empty/loading/error/denied states and user-facing exports. Locale switching preserves authorized task/filter state and selects localized labels, number/date formats and export headings. Keep stable technical identifiers and original provider artifacts unchanged; identify source language rather than inventing translated originals. This final founder requirement supersedes the earlier Russian-only initial Improvement exception. Verify all three locales and affected layouts in consolidated acceptance. The English prototype records interaction decisions only. Preserve existing admin navigation and report/audit workflows.

The conservative #917 disclosure resolution uses the last completed Monday-to-Monday UTC calendar week versus its disjoint predecessor. Today exposes freshness only. Released weekly counts remain immutable; fixed-cohort maturity-bound rates publish once. The [UI disclosure resolution](../ui/analytics-improvement.md#conservative-disclosure-resolution-2026-10-18) records the explicit departure from the rolling prototype, period-end inventory and privacy limitations. Filters include approved Listing city/release context; show the explicit scope for any independent cohort or fixed investigation fixture. Evidence drawer preserves filters and restores focus. Small-group, empty, loading, unavailable and delayed states remain distinguishable.

Founder-only access initially. Enforce separate aggregate viewer and diagnostic investigation permissions server-side; later named grants/revocations audited. TM equipment handler receives no automatic access. Reason required before detailed timeline reads or scoped exports; log actor, purpose, scope/time, release and result, never the exported content. Audit failure refuses restricted reads/exports. Diagnostic access grants no private Message evidence permission. Export is a narrowly scoped investigation action, not unrestricted bulk raw data download; limits/redaction and retrieval expiry require implementation proof.

Fixes link existing GitHub issues with owner/status/evidence and manual verification. The scorecard does not create a competing task tracker or automatically create/update issues, verify fixes, pause growth, deploy or roll back.

## Campaign work packages and evidence

Reuse #602/#604-#608. Chief of Staff reconciles ready work only after shaping approval/merge:

1. Collection/disclosure and shared schema/identity/security contract, with unresolved regional eligibility explicitly gated.
2. First-party ingest, queue isolation, dedupe, retention/deletion and authoritative outcome/visibility production.
3. Sanitized attributed diagnostics and minimal health/alert delivery; protect core resources.
4. Feature emission and reproducible rollups, including video at its campaign phase.
5. Approved admin views, scoped permissions and audited investigation.
6. Combined campaign acceptance and recovery/hosting preparation.

Independent source features can instrument against the same verified contract; dealer/report extensions wait on their specs. #880 staging controls are checked by the coordinator, not assumed implemented. No independent issue PRs or implementation campaign is started here.

Acceptance requires literal fixture checks through real owning interfaces for dedupe, denominators, windows, suppression, delete/late-event/restore and permissions; controlled end-to-end telemetry outages must leave core journeys usable. Chief of Staff runs one consolidated final native acceptance campaign after assembly, with affected reruns. Native crash symbolication, exact build delivery, deployed alerts and representative-network/restore proof remain release gates. Static prototype and unit tests do not pass them.

## Wider launch operating policy retained

The following earlier operating/scaling policy is retained for wider launch planning. The invited Android pilot's exact rollout/staffing/measurement rules above and in 84 take precedence over overlapping generic cohort, cadence, north-star, cities and thresholds below. Read this appendix as human review guidance, never new automatic pause/rollback authority. Feature-dependent signals apply only when shipped; older dealer/iOS/general-beta targets do not become additional pilot gates. Unrelated wider-launch policy is preserved rather than deleted by this bounded analytics addition.

## Operating cadence

### Launch day

- Monitor every 30 minutes.
- Watch reliability first: OTP, uploads, API, SMS, contact flow, and push only if shipped.
- Watch support and moderation queue.
- Do not optimize growth on day one.
- Write end-of-day launch note: what broke, what worked, what changes tomorrow.

### Week 1

- Daily launch review at the same time.
- Compare the same scorecard each day.
- Assign one owner for each red metric.
- Keep fixes small and safe.
- Do not add major new features.

### Weeks 2-4

- Review 3 times per week.
- Start separating reliability problems from product conversion problems.
- Decide whether growth can increase city by city.
- Write the MLP beta / public soft-launch retro at the end of week 2 or week 4.

### Month 2-3

- Weekly growth/ops review.
- Use city supply/demand to guide outreach.
- Start post-MLP betting from data.
- Re-evaluate success metrics and revenue assumptions.

### After month 3

- Monthly strategy review.
- Continue weekly ops review if reliability or moderation remains unstable.
- Decide whether to broaden growth, build inspection program, or deepen dealer tools.

## Decision rules

### Reliability rules

| Signal | Threshold | Action |
|---|---|---|
| OTP success | < 95% for > 24h | Pause growth, fix SMS gateway/rate limits |
| Upload success | < 95% for > 24h | Pause seller push, fix media pipeline |
| API error rate | > 2% sustained | Investigate; rollback if deploy-related |
| Push failure | > 10% for 15 min | Fix provider/token handling |
| SMS phones | 2+ phones offline | Stop broadcast/growth, repair phone fleet |

### Marketplace rules

| Signal | Threshold | Action |
|---|---|---|
| Active listings | < 30 after launch month | Direct seller/dealer outreach |
| Connection rate | Near zero despite listing views | Fix listing detail/contact UX |
| Zero-result searches | > 30% of searches | Seed supply/catalog in demanded areas |
| Seller response | Consistently slow | Nudge sellers; prioritize dealer quality |
| Publish funnel | High draft dropoff | Fix wizard, catalog picker, uploads |

### City rules

| Pattern | Meaning | Action |
|---|---|---|
| High demand, low supply | Users want cars there | Recruit dealers/sellers, seed listings |
| High supply, low demand | Listings exist but buyers absent | Local content/community push |
| High views, low contacts | Listing quality/contact UX problem | Improve detail page, seller prompts |
| High reports by city | Trust/supply quality issue | Increase moderation and verification |
| Many zero-result brand/model searches | Catalog or supply gap | Seed catalog and recruit listings |

### Trust rules

| Signal | Threshold | Action |
|---|---|---|
| Reports pending | Cannot clear daily | Add moderation time |
| Scam reports | Spike by seller/city | Suspend faster, add validation |
| Dealer complaints | Repeated | Review verification and dealer status |
| Account deletion requests | Spike after launch change | Review UX/privacy issue |

## Growth stages

### Stage 0: Internal readiness

Audience:

- Team only.
- A few trusted test accounts.

Goal:

- Production works.
- Alerts work.
- Rollback works.
- Admin tools work.

Exit:

- Launch gates green.

### Stage 1: Beta cohort

Audience:

- 10-30 invited users.
- Sympathetic dealers.
- Friends/family who will report bugs clearly.

Goal:

- Catch bugs.
- Validate OTP/upload/contact on real devices. Validate push only if direct-message push has shipped.
- Verify listing creation and moderation.

Exit:

- No unresolved P0/P1.
- OTP/upload >= 95%.
- Admin can clear reports daily.

### Stage 2: Controlled public soft launch

Audience:

- App stores public.
- Founder network.
- Limited Telegram/Instagram announcement.
- Early dealer outreach.

Goal:

- Prove liquidity and reliability.
- Learn city supply/demand.
- Observe real seller behavior.

Exit:

- Week-1 reliability stable.
- Connections per active listing non-zero and improving.
- Support/moderation manageable.

### Stage 3: City-focused push

Audience:

- Start with Asgabat unless data says otherwise.
- Expand to cities where demand exists.

Goal:

- Build density.
- Recruit sellers/dealers city by city.
- Avoid empty-market disappointment.

Exit:

- City scorecard shows stable supply, demand, and trust.

### Stage 4: Broader TM growth

Audience:

- Wider public marketing.
- Partnerships.
- Dealer acquisition motion.

Goal:

- Scale without breaking reliability or moderation.

Exit:

- Month-3 review decides Phase 2 investment priority.

## Post-launch review templates

### Daily launch review

Use this agenda during launch week:

1. Reliability: OTP, uploads, API, contact flow, SMS phones, and push only if shipped.
2. Liquidity: qualified connections, connection rate, listing views.
3. Supply: active listings, new listings, publish funnel.
4. Demand: DAU, searches, contact starts; saved searches/favorites only if shipped.
5. Trust: reports, bans, moderation response time.
6. City gaps: top demand cities, top supply cities, zero-result cities.
7. Actions: one owner, one fix, one deadline per red metric.

### Weekly growth review

Use this agenda after week 1:

1. What changed in the north-star metric?
2. Which city has the clearest supply/demand gap?
3. Which funnel step is losing the most users?
4. Which dealer/seller behavior is blocking liquidity?
5. Which reliability issue blocks growth?
6. Which manual outreach should happen this week?
7. What do we explicitly defer?

## First 30-day targets

These are early operating targets, not investor promises.

| Metric | Target | Why |
|---|---|---|
| OTP success | >= 95% | Auth must work |
| Upload success | >= 95% | Sellers must publish |
| Active listings | 30+ by day 30 | Marketplace cannot look empty |
| Verified dealers | Target only after the dealer bet ships | Trust and supply |
| Qualified connection rate | Non-zero in week 1, improving by week 4 | Liquidity |
| Zero-result searches | < 30% | Catalog/supply relevance |
| Moderation queue | Cleared daily | Trust |
| P0/P1 bugs | 0 unresolved at launch | Operational safety |

## Serious-review triggers

Run a serious review if any of these happen:

- OTP success under 95% for more than 24 hours.
- Image upload success under 95% for more than 24 hours.
- Fewer than 30 active listings after launch month.
- Qualified connection rate near zero despite listing views.
- More than 30% of searches return zero results.
- Seller response time is consistently bad.
- Moderation queue cannot be cleared daily.
- Fewer than 2 active verified dealers after launch month.
- Users abandon listing creation before publish at high rates.
- City demand exists but no supply can be recruited.

Serious review outcomes:

- Reliability problem: stop growth and fix infra/SMS/upload.
- Supply problem: direct seller/dealer outreach and seed listings.
- Demand problem: improve SEO/content/community distribution.
- Conversion problem: fix listing detail/contact UX.
- Trust problem: tighten moderation, reports, and dealer verification.
