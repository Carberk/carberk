# Vehicle History — approved small-PR graph

Status: founder-approved breakdown, 14 November 2026. VH-01…VH-22 are stable slice identifiers; the GitHub parent maps them to published issues. Preserve #912/#913 as historical scope anchors. No production implementation is authorized by this file.

Every slice includes its narrow end-to-end behaviour, relevant real-boundary tests, required TK/RU/EN UI/copy and current-session/object authorization. A synthetic/tester-only gate prevents partial flows reaching real customers. Each PR targets ~500–1,000 changed lines, excluding generated files/lockfiles; refine/split before starting if the concrete diff will exceed that. No integration campaign or horizontal “build all schemas first” phase.

1. **VH-01 — A specifically authorized operator opens the Vehicle History desk**
   - **Blocked by:** None.
   - **Delivers:** An empty, localized, synthetic-only History desk with current-session and explicit purpose authorization, preserving existing admin sign-in/TOTP behaviour. An ordinary marketplace admin or dealer receives no automatic private-service access.
   - **Acceptance:** Local synthetic staff fixture enters; ungranted/revoked/suspended/deleting actor is refused at the HTTP and UI boundary; no real staff onboarding or service collection. Only the minimal staff-public boundary and empty destination needed by this service.

2. **VH-02 — Founder manages named History staff access**
   - **Blocked by:** VH-01.
   - **Delivers:** A bounded grant/revoke action for History capabilities with actor, target and reason audit. Current authority changes apply to subsequent protected requests, including valid-but-stale tokens.
   - **Acceptance:** Explicit founder authority, no self-escalation, scoped non-marketplace-admin TOTP access, revocation observed through the existing desk. Existing moderator/admin sessions continue to work. If the TOTP compatibility diff alone exceeds the size budget, split that narrow path before publication.

3. **VH-03 — Customer finds the offer and opens an enquiry**
   - **Blocked by:** VH-01.
   - **Delivers:** Public information at Home/Listing entry, sign-in on contact, creation and reopening of an empty private Vehicle History Request in Messages. Outside vehicles and absent VIN work.
   - **Acceptance:** Price/provider caveats, synthetic sample clearly marked, one idempotent request creation, private requester ownership, optional Listing without seller access, no payment/order/hold generated. Empty/loading/error states and auth-intent replay.

4. **VH-04 — Customer and assigned operator exchange enquiry messages**
   - **Blocked by:** VH-02, VH-03.
   - **Delivers:** Operator claims the request, both sides send/read text with retained account-scoped drafts and retry-safe messages. Enquiry queue is distinct from paid work.
   - **Acceptance:** No fake Listing Conversation, duplicate message refusal/deduplication, readable reconnect state, current assignment on reads/writes, stale async work fenced after account/request switches. Start with the narrow authoritative HTTP path; do not build General Support.

5. **VH-05 — Operator hands over a request without leaking authority**
   - **Blocked by:** VH-04.
   - **Delivers:** Explicit named handover with visible customer update and refreshed operator queue. Previous assignee loses protected read/mutation authority as specified; the customer retains access.
   - **Acceptance:** Concurrent claims/handover yield one winner, stale assignment conflicts have an actionable refresh, former staff cannot use known IDs; historical private access remains separately restricted.

6. **VH-06 — Operator proposes a VIN-specific offer after availability checks**
   - **Blocked by:** VH-04.
   - **Delivers:** VIN input and permitted synthetic/manual preflight, clear non-available outcomes, then a quote preview showing exact VIN, 100 TMT, provider rule, known original date and explicit proposed time/refund terms.
   - **Acceptance:** Normalize safely, distinguish malformed/unsupported/no-history/mismatch/outage, never infer physical identity or condition, no payment instructions on failed preflight. Provider boundaries are manual/fixture-backed and live-disabled.

7. **VH-07 — Customer accepts a feasible quote and gets a two-hour hold**
   - **Blocked by:** VH-06.
   - **Delivers:** Explicit acceptance snapshots quote facts, holds one accepted-day slot and shows wallet instructions/expiry in the conversation with persistent order status.
   - **Acceptance:** Atomic creation/idempotency, no silent Listing-driven changes, today/next-day basic bounded availability, hold expiry releases capacity. Wallet destination is controlled configuration, not hardcoded customer data. No actual collection while live activation is disabled.

8. **VH-08 — Customer submits private payment proof with retry**
   - **Blocked by:** VH-04, VH-07.
   - **Delivers:** Receipt photo/screenshot staging, submission and operator viewing through the service's private-file boundary. Failed upload retains a retry path and says not to pay again.
   - **Acceptance:** Correct purpose/owner/assignment, bounded validated file type/size, no public photo/chat bucket fallback, no payment confirmation from receipt alone, interrupted upload/retry/abandoned-object cleanup behaviour. Reuse the resulting private-file boundary for PDFs later.

9. **VH-09 — Operator verifies actual wallet receipt once**
   - **Blocked by:** VH-05, VH-07, VH-08.
   - **Delivers:** Independent manual wallet check and confirmation, amount/reference/evidence/actor plus received and confirmed timestamps. Both sides see unambiguous pending or confirmed payment.
   - **Acceptance:** Duplicate confirmation has one effect; partial/unmatched/uncertain receipts stay under review; verify/expiry/handover races have one authoritative outcome. Full funds received without a valid hold cannot silently enter fulfilment.

10. **VH-10 — Reconcile late and after-hours receipts with a new agreement**
    - **Blocked by:** VH-09.
    - **Delivers:** Expired/overnight hold handling, verification from 09:00, operator's feasible replacement window and customer's explicit acceptance/decline. Verified money remains recorded without another charge.
    - **Acceptance:** No silent hold restoration or morning guarantee; old timestamps/evidence retained; no acceptable booking produces a pending founder refund decision that VH-18 will complete. Neither this nor later refund UI is exposed live while incomplete.

11. **VH-11 — Enforce paid FIFO and bounded staffed/provider capacity**
    - **Blocked by:** VH-07, VH-09.
    - **Delivers:** Operator sees older confirmed paid work first; quoting/acceptance respects close-of-day feasibility and capped next-day-by-10:00 work. Unpaid enquiries remain available when both days are full.
    - **Acceptance:** Separate provider-account allowance/reset/other-channel effects from staff throughput; explicit later-window agreement; no universal 19:00 cutoff or assumed 100/day contract. Real disposable concurrency and clock-boundary proof; synthetic capacities clearly marked.

12. **VH-12 — Review a VIN correction without silently changing an order**
    - **Blocked by:** VH-06, VH-07, VH-09.
    - **Delivers:** Requested correction, operator review/recheck and renewed customer acceptance before any purchase, retaining previous accepted facts and already received funds.
    - **Acceptance:** No automatic extension of holds, no seller/Listing mutation of confirmed VIN, no purchase while correction is pending. After-purchase other-car changes require a new request; company errors stay distinguishable. VH-13 consumes the immutable accepted version.

13. **VH-13 — Record manual fulfilment intent and reconcile uncertain outcomes**
    - **Blocked by:** VH-05, VH-09, VH-11, VH-12.
    - **Delivers:** Assigned operator selects permitted archive/new-source intent for one paid order, records manual provider outcome and reconciles uncertainty before retrying.
    - **Acceptance:** Current assignment and accepted VIN fenced in the authoritative transition, one order-scoped intent, no auto-purchase on receipt/reopen, no duplicate action on lost responses. An explicit company-funded correction is distinct from an uncertain retry and never adds a customer charge. No paid provider call or scraping introduced; failure is handed to the order recovery boundary.

14. **VH-14 — Operator validates an original private report and matching link**
    - **Blocked by:** VH-08, VH-13.
    - **Delivers:** Private original PDF association plus VIN/provider/date/pages/rights/link checks; uploads and wrong/unusable documents remain pending or rejected instead of delivered.
    - **Acceptance:** Original-byte integrity and attribution, one/both/no-provider distinction, file retry without another lookup, correct request/purpose/assignment. Synthetic fixture PDFs only unless concrete sample rights are recorded.

15. **VH-15 — Purchaser receives and reopens the private report**
    - **Blocked by:** VH-14.
    - **Delivers:** Audited delivery association, persistent report card and authorized customer reader/retrieval; reopening adds no order, fee or lookup.
    - **Acceptance:** Original date/VIN/provider visible, no key/upload-completion shortcut, cross-purchaser/seller/dealer/revoked-staff/known-URL/cache reads denied, accessible loading/error/retry. Private delivery mechanism exercised against actual disposable storage.

16. **VH-16 — Open/download/share on owned devices and recover file/link failures**
    - **Blocked by:** VH-15.
    - **Delivers:** Actual native fixture PDF open/download/permitted share and separately labelled provider link; failed retrieval/link enters an actionable retry/help state.
    - **Acceptance:** Original provider language preserved, no permanence/revocation promise for external copies, expired link does not erase a usable PDF, no purchase on retry. Owned-device evidence replaces any need for a real-user pilot; failures feed VH-17's promise/recovery policy.

17. **VH-17 — Missed promises lead to one agreed recovery window**
    - **Blocked by:** VH-10, VH-11, VH-13, VH-15.
    - **Delivers:** Immediate paid-promise escalation, customer choice of one exact additional staffed hour or founder refund decision, with second miss automatically pending that decision.
    - **Acceptance:** Customer agreement and deadline persisted, no silent extension/repeated allowance, close-of-day staffed-time calculation, no-provider/company-error/file-delivery failure context. Pending refunds are explicit until VH-18.

18. **VH-18 — Founder approves a refund and records actual money return**
    - **Blocked by:** VH-02, VH-09, VH-10, VH-17.
    - **Delivers:** Narrow founder decision and authorized manual execution record, with amount, actor, reason, external reference and separate customer-visible approval/completion states.
    - **Acceptance:** Approval never claims money returned, stale/ungranted actors denied, idempotent execution record, correct paid amount, no ordinary paid cancellation or automated wallet refund integration. Company-funded correction is represented without another customer charge; uncorrectable company error enters this flow.

19. **VH-19 — Reuse permitted archived history without prior-customer leakage**
    - **Blocked by:** VH-13, VH-14, VH-15.
    - **Delivers:** Scoped operator VIN search over permitted artifact metadata and safe association with another paid order; customer repeat-VIN warning links only their own previous purchase.
    - **Acceptance:** Known original date shown before new acceptance, original provenance/source restrictions preserved, no prior identity/messages/receipt/private notes, no unrestricted archive/export browser. Free reopening and explicit new request remain distinct.

20. **VH-20 — Deletion and rights changes immediately remove prohibited access**
    - **Blocked by:** VH-08, VH-15, VH-19.
    - **Delivers:** Category-policy admission and deletion/withdrawal/rights-change handling that closes reads and associations immediately and journals exact private cleanup work while retaining only permitted classified facts.
    - **Acceptance:** Missing basis/schedule fails closed for live collection, no invented blanket retention, personal versus provider/durable knowledge separated, justified holds cannot broaden readers. Existing account-deletion UI has observable removed-history behaviour.

21. **VH-21 — Finish private cleanup and prevent restoration from reviving it**
    - **Blocked by:** VH-20.
    - **Delivers:** Retryable worker cleanup of exact private objects and restricted derivatives, with recovery/restoration applying deletion/source restrictions before reopening access.
    - **Acceptance:** Failed delete/retry, duplicate jobs, shared permitted artifact versus purchaser evidence, exact-key ownership and restored-copy scenarios against real disposable storage/database. No broad bucket deletion or unrelated data reset.

22. **VH-22 — History updates reach the correct signed-in customer reliably**
    - **Blocked by:** VH-04, VH-09, VH-15, VH-18.
    - **Delivers:** Relevant service messages/order updates, unread state and generic push navigation to the correct request, with authoritative refetch after reconnect and preservation of current actor isolation.
    - **Acceptance:** No VIN/receipt/payment details in default lock-screen copy, no send to a real recipient during proof, duplicate-event handling and stale account/request fencing, owned-device synthetic push/deep-link evidence in TK/RU/EN. Reuse the existing notification boundary.

## Whole-service acceptance, not another integration campaign

- Keep each PR independently green and reviewed with sol-loop; no merge without founder/full-send authority.
- Connect the three agreed complete stories plus the alternate-case matrix from [scope.md](scope.md). Each ticket's own relevant tests stay the source of implementation proof; final acceptance verifies integration, accessibility/locales, security and operational recovery rather than replacing them with mock walkthroughs.
- Network and storage verification uses synthetic accounts, owned devices and fault injection; gateway hosting decisions remain separate. Full bucket migration and advanced gateway scaling are not ticket blockers.
- Production collection/provider/payment activation remains closed until the concrete operational evidence and separate authorization exist. Shipping synthetic code is not commercial activation.

## Approval

The founder approved this scope and dependency graph. Publish the slices with native parent/blocking relationships; retain the narrow Vehicle History scope and split an oversized concrete slice before implementation. Do not restore the broad retired staff/admin/Support campaign.
