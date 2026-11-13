# Vehicle History — approved implementation scope

Status: founder-approved scope and delivery breakdown, 14 November 2026. Preserved design evidence outside main. GitHub issues own delivery status; this artifact does not authorize production implementation, provider purchases, payment collection or deployment changes.

## Outcome

A signed-in User can ask Carberk about a vehicle, accept a 100 TMT offer for one exact VIN, transfer through a mobile wallet outside Carberk, submit payment evidence, and receive permitted original provider history. A named operator verifies the receiving wallet manually, fulfils the order, and handles uncertainty without duplicate charges or provider purchases. Service failure leads to an explicit recovery agreement or a founder refund decision; an approved refund is not shown as completed until actual execution is recorded.

The customer always sees the current order state, agreed VIN/window and next action alongside the conversation. The workbench tells the assigned operator what they can do next and what is waiting on the customer, provider, payment reconciliation or founder.

## Authority and changes accepted in this conversation

- ADR-0106 owns the separate Support, Vehicle History and business-messaging boundaries. ADR-0107 governs qualified durable vehicle/market knowledge; neither authorizes unrestricted provider-data reuse or personal-data retention.
- Open [#912](https://github.com/Carberk/carberk/issues/912) and [#913](https://github.com/Carberk/carberk/issues/913) supply the existing service scope. Their campaign dependencies and integration-PR closure wording are obsolete. The full #897 discussion and relevant dependency closures were read; #900, #903, #906 and #911 were closed **not planned**, not delivered. The [campaign retirement](https://github.com/Carberk/carberk/issues/897#issuecomment-6619190914) explicitly requires re-cutting Vehicle History from current main.
- Current main has no Vehicle History owner/order/artifact implementation. Existing Listing Conversations require a Listing; existing Help opens contact channels. Archived service code and prototypes are reference material, not shipped functionality or a branch to merge wholesale.
- **Founder-approved change:** show the original provider report date when a selected existing artifact makes it known, before quote acceptance/payment. State when it is unknown before lookup. This replaces #913's earlier prepayment date-concealment requirement for this work. Preserve original delivered dates and avoid freshness promises. Update the active issue requirements when publishing the approved plan; do not silently edit historical ADR text.
- **Founder-confirmed payment method:** manual mobile-wallet transfer, with instructions and receipt photo/screenshot in the conversation. Operator checks actual receipt in the receiving wallet, then confirms. This scope does not introduce bank checkout, phone-credit transfer or automatic wallet access.
- **Founder-approved interaction:** a compact persistent order summary with status and next action, with focused quote/payment/recovery actions beside the conversation.
- No real users are available. Synthetic accounts/data, automated integration/contract tests, owned simulators/devices, fault injection and VPS-origin tests are the verification approach. Recruiting a pilot is not a dependency.

## Included in the first complete service

### 1. Discovery and enquiries

- Compact Home entry above brand/model selection, contextual Listing entry, and request/report history in Messages. Optional source Listing is context only; outside vehicles work too.
- Public explanation and 100 TMT price are readable signed out. Contacting the operator requires sign-in. An educational sample requires rights; an unmistakably fictional Carberk fixture can be used during development.
- Questions without a VIN or purchase create an enquiry, not an order, capacity hold or lookup.
- One request conversation can lead to one order. Further orders use new requests. Repeat-VIN history offers free reopening of the existing purchase and an explicit new request.
- Customer/operator text messages and private image evidence; delivery/read state, retry/reconnect and account-isolated drafts. A message is never a substitute for an authoritative order transition.
- One helpful reminder after 24 hours waiting for an answer/quote choice; never after decline/stop, and never repeated automatically.

### 2. Exact VIN, availability and quote

- Normalize harmless whitespace/case. Do not replace ambiguous characters or equate format validity with authentic physical identity.
- Distinguish malformed input, unsupported vehicle/product/market, no history, identity mismatch and temporary provider failure. No payment instructions until an authorized availability check is satisfactory.
- Quote includes exact VIN, 100 TMT, the available-provider rule, original report date when known, specific delivery day/window, payment expiry and applicable refund rules.
- Either available Carfax or AutoCheck is sufficient; both when obtainable. No guarantee of complete/local history, fresh lookup, accident-free condition or a combined Carberk inspection verdict.
- Operator selects a permitted archive artifact or new lookup. The customer does not choose a caching mode. Reusing a permitted report can cost 100 TMT for a new order; reopening the same purchase is free.
- Quote acceptance preserves a snapshot. Listing edits/ownership changes cannot alter the accepted VIN or grant a seller/dealer access.
- Before purchase, a later VIN correction requires operator review, permitted availability recheck and renewed explicit acceptance. After a purchase for the customer-confirmed VIN, another car requires a new order. Operator error is corrected at company cost or refunded if undeliverable.

### 3. Booking and manual payment

- Daily staffed hours: 09:00–20:00 Asia/Ashgabat, UTC persistence. Normal available-capacity estimate is one staffed hour; a later specific window needs acceptance before payment.
- Only today and the next staffed day are bookable. Same-day acceptance depends on actual feasibility before close, without a universal 19:00 cutoff. Prepaid next-day work is due by 10:00 and limited by demonstrated morning throughput.
- Provider allowance/reset/counting and staff capacity are separate constraints, including other-channel usage and uncertain purchases. Do not hardcode the historical “100/day” statement as a verified provider contract.
- Payment instructions create one two-hour hold for the accepted day. Expiry and verification have one authoritative atomic outcome. No capacity today/tomorrow stops payment instructions while keeping enquiries open.
- Customer transfers manually and submits proof. Receipt submitted, funds received, payment verified and booking committed are distinct facts. Store received/confirmed timestamps, actual amount, matching reference/evidence and verifying actor.
- Duplicate, unmatched, partial and uncertain receipts remain under review. Do not silently issue another purchase or ask a customer to pay again after an upload/transport failure.
- An expired hold is released. A late receipt stays recorded and needs actual verification plus a newly agreed feasible day/window, or a founder refund decision if none is acceptable. It never silently restores the old slot.
- After-hours proof waits for verification at 09:00. Explain this before payment where relevant. Receipt submission alone does not guarantee a morning slot.
- Confirmed paid orders follow oldest confirmed payment first; older backlog comes first. Unpaid enquiries have their own queue.

### 4. Operator fulfilment and delivery

- Named assignment, explicit handover, current-session/capability checks and current assignment version on payment, purchase intent, artifact association and delivery.
- Manual provider work behind a narrow permitted-provider boundary. No provider API integration, scraping or browser automation is assumed. Record one order-scoped intent and reconcile uncertain external outcomes before retrying.
- Operator attaches original PDF(s), attributed source, original date, VIN/vehicle claim, expected pages, permitted-use provenance and matching approved shared link. Upload completion is not delivery.
- Validate exact VIN, provider, date, readable usable pages and link before delivery. Do not translate or rewrite original provider artifacts or merge conflicting provider facts into a new verdict.
- Purchaser can reopen, open/download and share where rights permit. Distinguish the private Carberk order/file access path from a separately approved external provider sharing link. Shared copies cannot be recalled; no external-link permanence is promised.
- Failed upload/open/download remains recoverable within the accepted promise/recovery policy and never buys another report. An expired external link does not erase a usable purchased PDF; provide a permitted replacement or appropriate recovery.
- No usable provider or PDF is not successful fulfilment.

### 5. Failure, recovery and refunds

- Missed paid promise escalates immediately. One further staffed hour is available only after the customer's explicit agreement to the exact deadline.
- Decline or second miss goes to founder refund decision. No silent rolling promises or unlimited paid backlog.
- No ordinary cancellation after verified payment. Service failure, unresolvable late booking and company error retain their agreed recovery/refund paths.
- Founder approval, actual external refund execution, amount, executing actor and reference are distinct audited facts. A missing/pending refund method cannot be shown as money returned.
- No automated refund transfer is included. The workable wallet/refund procedure is an operational activation input.

### 6. Private archive and lifecycle

- Keep Provider Report Artifacts and permitted vehicle observations separate from purchaser identities, chats, payment evidence and restricted order associations.
- Archive reuse is permission-qualified and never reveals an earlier purchaser's messages, receipt, contact details or private notes.
- Every read/download/action rechecks object purpose and current actor authority server-side. Known identifiers, URLs, caches, old assignment, ordinary marketplace admin status, seller/dealer membership and another paying customer do not grant private access.
- Use private storage with an S3-compatible boundary and local MinIO fixtures. No public photo/chat bucket or reusable public object URL for receipts/PDFs. The private delivery mechanism must prove revocation and cache behaviour, not just hide links in navigation.
- Record category-specific purpose, basis, provenance, allowed use/reuse/redistribution, retention/deletion restrictions and justified holds. Missing required policy blocks live collection, not synthetic implementation.
- Enforce personal deletion/withdrawal and source restrictions through associations, derivatives, exact-key cleanup and restoration/recovery paths. No blanket forever or 90-day Vehicle History policy. VINs/hashes alone do not establish anonymity.
- Preserve only permitted durable vehicle knowledge. Commercial data sales, broad exports and an analytics product are outside this delivery.

## Boundaries that keep this work small

- Vehicle History owns request/order/quote, payment reconciliation, fulfilment commitment, recovery/refund decisions and artifact/archive association.
- Business messaging owns service communications, attachment associations and read/delivery state. It does not mark an order paid or fulfilled.
- Identity owns explicit staff grants/current sessions. The service owns assignment/object policy. Founder refund and historical evidence/export access are separate capabilities.
- Reuse existing sign-in, API client/session refresh, notifications, admin token bridge and local object-storage/test infrastructure through their public boundaries. Reuse archived ideas selectively after checking current source; do not import the retired campaign framework.
- Only the scoped Vehicle History customer and operator surfaces are included. General Support, unrestricted admin dashboards and the retired combined service campaign are not prerequisites.

## What the prototype covers

Open [the full journey prototype](index.html). It has three prominent complete stories plus alternate guided cases. Each step invokes the same in-memory transition used by the free-play actions; the activity panel exposes the simulated state and refusals.

| Coverage | Guided cases |
|---|---|
| Enquiry, quote, manual payment, delivery and free reopening | Request → report |
| Expiry, verified late receipt, new agreement or refund | Late transfer → new booking; Late payment, no acceptable slot |
| Missed promise, accepted/declined extension, second miss, actual refund record | Failed delivery → refund; Agreed recovery → report; Recovery deadline missed |
| Failed receipt upload, unmatched and partial payment, duplicate confirmation | Receipt retry / unmatched / partial |
| Closing hours, expired overnight hold and new morning agreement | After-hours receipt |
| Invalid VIN, unsupported/no history/mismatch/outage, full capacity, renewed VIN quote | VIN, availability and full capacity |
| Free old purchase, explicit new request, no earlier purchaser access | Previous purchase / archive reuse |
| Unknown provider outcome with no repeat purchase | Uncertain provider purchase |
| Named handover and old-operator refusal | Operator handover |
| PDF upload failure, wrong VIN, validation, retrieval failure and external-link recovery | PDF / link failure and recovery |
| No provider result, company-funded correction or refund | No usable provider after payment; Company VIN error; Company-funded VIN correction |
| Provider count and missing-rights refusal | Both providers / permitted use |
| Stale quoted window cannot create a late order/hold | Quoted window passed before acceptance |
| One reminder, no repeated reminder, no reminder after decline | Enquiry reminder / decline |

Limits: English web study, synthetic clock/queue/rights/accounts, in-memory state and simulated wallet/provider interactions. The downloadable PDF is a fictional Carberk fixture, not provider data. Native opening/share sheets/push, translated TK/RU screens, accessibility APIs, concurrent storage/database effects, deletion and real network routes still require implementation evidence. A static denial in this prototype proves no authorization boundary. The separate earlier [payment prototype](payment-study.html) remains available.

## Implementation proof

Each small PR carries the relevant proof; final acceptance connects the complete journeys. No real-user recruitment is needed.

- Use external behaviour at real HTTP/authenticated application boundaries with disposable Postgres, queue/worker and private MinIO/S3-compatible storage for claims those boundaries own. Prefer existing API/e2e and local fixture infrastructure. Pure domain tests cover deterministic clocks/amounts/transitions; fakes cannot establish the database locks or storage ACL being tested.
- Concurrency: simultaneous hold allocation/expiry/payment verification, duplicate receipts/confirmation/intents/delivery, late outcomes after retries, current assignment/session/capability changes, and bounded FIFO/provider/staff capacity.
- Fault injection: lost responses, interrupted receipt/PDF upload and download, unavailable storage/provider boundary, uncertain external purchase, process restart/reconnect, and stale callbacks after account/request changes.
- Security: purchaser versus unrelated customer/seller/dealer, wrong service capability, stale assignee, revoked session/grant, signed-out file access, known URL/cache paths, historical payment evidence, exact-key cleanup and restoration without resurrection.
- Owned-device proof: customer discovery/history/quote/payment/recovery, real fixture PDF opening/downloading/permitted sharing and push navigation; desktop/tablet operator actions. Test TK/RU/EN, keyboard/focus, long text, empty/loading/error/offline/denied states. Keep private data out of lock-screen notification previews unless a later explicit decision allows it; use a generic service update by default.
- Storage/network proof: authorized private byte delivery via the verified boundary, with repeatable synthetic upload/download interruption and safe reconciliation. VPS-origin checks complement the separate gateway proof. They do not prove actual TM handset/ISP performance.
- The gateway discussion's warm API p95 ≤2s, reachable-route failover ≤10s and ten mixed synthetic sessions remain proposed staging targets, not observed end-user measurements or a new Carfax-specific SLA.

## Scope exclusions and activation inputs

Not included: bank/in-app checkout, automatic wallet access or transfer/refund execution, paid provider calls without authorization, scraping, report publication on Listings, public receipt URLs, physical inspections, full General Support, broad admin modernization, commercial data sales, bulk export tooling, a new analytics product, production migration, full bucket migration or advanced TM-gateway scaling.

Software proceeds with live actions disabled. Commercial activation later needs concrete provider/product/account/territory and preflight/coverage/quota evidence; resale/archive/reuse/PDF/link/sample/staff permissions; a controlled receiving wallet and workable verification/refund procedure; category-specific policies/basis/disclosures; named staff and synthetic/owned-operator throughput/recovery evidence. No new service purchase is authorized by this draft.

Railway-primary hosting remains the architecture proposal supplied to this thread. The durable hosting ADRs still need their separate superseding decision after gateway evidence. This feature does not silently revise them or depend on completing a full storage migration. Private delivery must use the storage/network boundary verified for its eventual activation.

## Approved delivery breakdown

The [approved ticket breakdown](tickets.md) contains 22 small, independently verifiable slices with blocking edges. VH-01…VH-22 are stable slice identifiers; the GitHub parent specification maps them to published issues. Each is intended for one ~500–1,000-line PR from current main, with its own relevant tests and localized affected UI. Splitting an oversized slice is required before publishing/starting it; the estimate is not permission to grow a PR.

All incomplete flows remain under a synthetic/tester-only gate. Tickets #912/#913 should become scope anchors with corrected references when publishing the approved plan; do not revive closed campaign dependencies, claim them delivered, close/modify them or publish replacements now.

The founder approved this scope and dependency graph. Ticket publication may proceed. No additional payment-method questionnaire or real-user pilot is required. Production implementation and commercial activation remain separate from this design approval.

## Prototype review evidence

All 19 defined synthetic stories were replayed through the pure transition model: 13 end delivered, five refunded and one remains an unpaid enquiry. This is walkthrough verification, not backend test evidence. Desktop/mobile rendered checks at 728/390 covered quote, expired quote, late rebooking, recovery, completed refund and conversation visibility, with no observed console errors or horizontal overflow. Review corrections cover active recovery deadlines, terminal-state guards, stale operator authority, stale quote acceptance, refund labels and hidden-pane conversation continuity.

The review rated customer/operator clarity and desktop/mobile readability 8/10 within the English synthetic study. Keyboard/screen-reader execution and native/localized proof remain outstanding; no whole-product accessibility or security score is claimed. The ticket graph has 22 defined nodes, no missing blocking references and no cycles. No production files or live resources changed during prototype preparation and review.
