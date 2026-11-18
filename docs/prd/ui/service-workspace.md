# Service workspace design contract

## Scope and evidence

The reviewed shaping basis is the synthetic combined customer/admin workflow developed on 2026-10-14. It exercises both-provider, one-provider, expired booking, failure/refund, archived delivery, Support reopen, full capacity and invalid VIN. Final founder campaign choices add precise failure deadlines and TK/RU/EN everywhere; those accepted policies govern missing-state completion. Prototype storage, payment, provider and roles were simulations. No production security or provider correctness is established by it.

The portable [synthetic service prototype](https://github.com/bagtyyarkovusov/auto.tm-rewrite/blob/4f1aebd826d898274e5ecdd31f18fcc51eb74178/output/campaign-review-20261014/service-workspace/index.html) is preserved outside main at commit `4f1aebd826d898274e5ecdd31f18fcc51eb74178`. It is design evidence, not production code. Before implementation acceptance, complete browser walkthroughs for FIFO, two-hour expiry/late payment, accepted/rejected delays, near-close/after-hours scheduling and personal-data/access boundaries. This is autonomous completion of agreed behavior, not new product scope.

## Customer surfaces

Home has a compact Vehicle History entry above brand/model selection; Listing detail and Messages request history provide contextual/repeat access. Public offer explanation, price and authorized sample precede sign-in; operator contact requires sign-in. Explain available Carfax/AutoCheck history, either provider sufficient, no freshness/local-coverage/condition guarantee. Use Open previous reports and New request; no promise of an updated check. Questions without VIN/purchase remain possible.

Request view contains service identity, assigned report operator with visible handover, optional source Listing, exact confirmed VIN and order status. Quote visibly states accepted VIN, price, provider-availability rule, PDF-only/link-only/both delivery format, known original report date, scheduled day/window, payment expiry and refund rules. Preserve these facts in the accepted snapshot before payment. Delivered reports retain original provider dates. Receipt submitted and payment confirmed are distinct. Late payment/after-hours verification is explained rather than shown as lost or successful.

Delivered artifact card names provider, confirmed VIN, original date and the agreed format. PDF-only shows actual filename/size and Open PDF/Download/permitted share; link-only shows Open report/Copy link for a qualified account-free target; both shows separate actions for matching artifacts. Hide absent-format actions rather than adding dead links or dummy PDFs. Preserve provider contents/disclaimers and source date. If no artifact is usable, never show fulfilled. Actual opening failure preserves a usable purchased PDF and offers simple recovery/contact-operator under the actual promise, without link-access periods, expiry/countdowns, lifetime or explanatory expiry copy, another purchase/payment or new time-based refund entitlement. A revised format still requires explicit customer acceptance under existing recovery policy. Reopen is free; refund pending and completed money return remain different states.

Private customer native and operator web conversations expose clickable report links and explicit full-link Copy while retaining surrounding text, selection and long wrapping. Open uses the normal external browser, respecting its user-selected default; require no embedded reader, Chrome installation, provider login, extra payment or operator credentials. Open and Copy preserve the exact original safe address/query/percent-encoding even if its display is shortened. Use accessible localized actions and truthful success/failure feedback, preserving focus, scroll, drafts and return. A URL in chat or browser launch is not paid delivery or proof of remote loading. #1278 owns this conversation slice; #1188/#1189/#1190 retain validation and paid-card/native/PDF integration. No automatic unfurl or token leakage in logs/analytics/public errors; runtime proof and screenshots use synthetic destinations only.

Before activation, Cabinet Help retains email/phone contact. Once Support is ready, one Messages Support row and Cabinet Help open the same case/history; add no Support links in Favorites or Listing Conversation menus. Support readiness does not activate paid providers or payments. Returning History actions are Open previous reports and New request, with no promise of updated provider history.

General Support is visually separate and uses Carberk business identity, header contact/info sheet and text/image composer. Staff notes are never visible as replies. Signed-out/no access/removed-history states do not leak private contents. Appeal remains reachable for restricted users. No extra Support entry links, PDF picker or promotional broadcast affordance is added.

## Operator surfaces

Desktop-first responsive workbench usable on tablets: operational overview, purpose-labeled inbox with enquiry/paid/Support queues, assignment/handover, conversation/public reply versus private note, VIN/Listing context, quote/payment review, fulfilment/PDF/link panel, refund escalation and permitted archive lookup. Exact badge counts link to corresponding filtered work and preserve queue/search context on return. Never call every kind of report “Reports” without distinguishing complaint, vehicle-history artifact and diagnostic findings.

Payment evidence, historical access, export and staff grants are capability-limited. Show current actor/assignment and relevant denial/conflict without implying navigation visibility is permission. Destructive/stateful actions explain consequence and require applicable reason; prevent double-submit visually while server fences remain authoritative. Stale ownership refreshes rather than letting two operators fulfil one request.

Original dated provider artifacts and attributed notes are distinct. A reused report must not appear newly generated. Optional source Listing does not grant seller/dealer access to private request or receipt. Full Listing viewer remains read-only aside from existing explicit moderation; staff ask for seller corrections through Support.

## Accessibility, localization and state coverage

TK/RU/EN applies to all admin, service, analytics and inspection areas, including shell, navigation, filters, charts, forms, labels, timestamps, validation and empty/loading/error/denied/conflict states, generated notices and user-facing exports. Preserve technical identifiers and original documents. Locale switch retains current work/filter context, handles long translations and accessible names. No Russian-only Improvement exception remains.

Use visible labels, keyboard focus/sequence, announced async status/errors and buttons with specific actions. Reading body/files/reasons must not require color alone. Expose accessible loading/empty/error/retry and uncertain-payment states; never present receipt upload or pending PDF as a completed order. Time labels explain service schedule/day and do not depend on operator server timezone. Shared diagnostic/analytics shell retains their independent permissions and report audiences.

## Verification boundary

Rendered customer/operator browser evidence covers actual HTTP authorization/state, not just in-memory prototype controls. Test narrow/tablet layouts, locale switching and keyboard error recovery. Final native PDF open/download/share and actual push receipt checks run with consolidated campaign acceptance unless an earlier dependency needs a focused proof. No repetitive simulator sessions are required for desktop/prototype shaping.
