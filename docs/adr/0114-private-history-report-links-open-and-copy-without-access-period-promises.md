# ADR-0114: Private History report links open and copy without access-period promises

- **Status**: Accepted
- **Date**: 2026-11-15
- **Deciders**: Carberk founder
- **Supersedes**: ADR-0113's recommendation to present report-link access/expiry limitations only; its accepted-format decision and other rights, authority and recovery boundaries remain.

## Context

ADR-0113 permits PDF only, an approved provider link only, or both, according to the promise accepted before payment. The founder has clarified what qualifies as a usable shared report link and how private History surfaces expose it. The customer must need no provider account, additional payment or operator credentials. The founder rejects a promised access period and explanatory expiry copy; this does not promise permanent access or establish a provider lifetime.

The current customer native and operator web readers render plain message text. Text selection alone does not provide explicit external Open and full-link Copy. #1278 owns those conversation interactions; validation and paid-report delivery remain separate slices. This decision records target policy, not implemented link behavior.

## Decision

Private customer and operator History surfaces provide explicit Open report and Copy link actions for the complete qualified HTTPS report address, using normal platform actions without an access-period promise.

Qualification requires customer access without provider registration/login, another payment or operator credentials. Validate usability for the audited delivery. A URL posted in conversation does not perform the authoritative paid-delivery transition, and a browser launch does not prove that the destination loaded.

Open passes the full original safe address to the normal external browser action, respecting the user's browser choice, including Chrome when selected. Do not force an embedded reader or browser installation. Copy passes the complete original address to the clipboard. Preserve all opaque query bytes and percent-encoding; display shortening, punctuation handling or wrapping must not alter either target. Preserve surrounding text, selection, accessible actions and useful failure/Copy feedback, with no unintended send, order or receipt effect.

Add no report-link access period, expiry date, countdown, lifetime guarantee or explanatory expiry copy. A later actual opening failure offers simple recovery/contact-operator controls under existing policy. It does not automatically create another purchase/payment or a new time-based refund entitlement. Existing payment-hold expiry, accepted fulfillment windows and agreed recovery deadlines remain distinct and unchanged.

Current private session, request, assignment and object authority remains enforced. Never forward Carberk credentials to the destination. Keep report addresses private: no automatic fetch/unfurl or query values in logs, analytics, public errors or engineering screenshots. Use an owned synthetic HTTPS endpoint and synthetic opaque query values for tests and proof; no real founder/customer example or provider content is needed.

Preserve PDF-only/link-only/both accepted promises, original provider contents/dates, rights and provenance, and free reopening. Both still requires both promised formats at delivery. A later link failure does not remove a usable purchased PDF. Shared external copies cannot be recalled by Carberk.

## Consequences

### Positive

- Customers can open a qualified report in their chosen browser or copy its exact address without another account or payment.
- Delivery remains an audited order action; message interaction cannot silently fulfill or change a paid promise.

### Negative / accepted costs

- Both real conversation consumers and later paid-report surfaces need exact-target Open/Copy tests and genuine native/browser proof, including failure, cancel/return, locales, long wrapping and accessibility.
- External opening can fail. Product recovery must remain useful without inventing a duration, provider lifetime or automatic refund clock.

### Neutral

- #1278 owns private conversation interaction; #1188/#1189/#1190 retain validation, paid-card/PDF delivery and native integration. No unrelated marketplace-chat redesign is included.
- Commercial/production activation, real provider calls and original sample publication remain unauthorized by this decision. Historical ADR text stays immutable.

## Alternatives considered

- **Selection-only or shortened-link Copy** — rejected because it leaves opening unclear and can corrupt the private target.
- **Force an embedded reader, account or browser installation** — rejected because qualified access must work through the customer's normal browser without extra credentials/payment.
- **Promise a period or explain expiry** — rejected by the founder; actual opening failure uses existing recovery without a new time-based entitlement.
- **Treat a chat URL as delivery** — rejected because it bypasses accepted-format validation and the authoritative delivery transition.

## References

- [Founder clarification](https://github.com/Carberk/carberk/issues/1174#issuecomment-6893133646), [conversation Open/Copy #1278](https://github.com/Carberk/carberk/issues/1278) and [policy reconciliation #1279](https://github.com/Carberk/carberk/issues/1279).
- [ADR-0113](0113-vehicle-history-delivers-the-format-accepted-before-payment.md), [Vehicle History policy](../prd/features/53-vehicle-history.md), [service flow](../prd/flows/68-service-requests.md) and [workspace design](../prd/ui/service-workspace.md).
