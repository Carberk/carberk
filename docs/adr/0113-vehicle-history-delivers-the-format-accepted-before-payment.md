# ADR-0113: Vehicle History delivers the format accepted before payment

- **Status**: Accepted
- **Date**: 2026-11-15
- **Deciders**: Carberk founder
- **Supersedes**: ADR-0106's mandatory PDF-plus-shared-link delivery clause only; all other ownership, rights and activation boundaries remain.

## Context

ADR-0106 requires a usable PDF and shared link for delivered provider history. The founder has explicitly approved PDF only, an approved provider link only, or both, as quoted and accepted before payment. A usable link alone can fulfill a paid order when link-only delivery was agreed. Provider availability and delivery format are separate facts: either available provider may suffice, while the accepted format determines the delivery obligation.

Existing agreed policy requires the quote and immutable accepted snapshot to preserve the exact VIN, provider offer, known original report date, price, delivery window and terms. They must also preserve the delivery format. This decision changes target policy and future acceptance tests; it does not establish implemented order or fulfillment behavior.

## Decision

Vehicle History fulfills the delivery format explicitly quoted and accepted before payment: PDF only, approved provider link only, or both.

| Accepted format | Required validation and customer actions |
|---|---|
| PDF only | Validate the usable original report, expected pages, provider, VIN, date and rights. Provide actual PDF open/download and permitted share actions. No dummy link is required. |
| Provider link only | Validate an approved usable link for the intended provider report/vehicle and permitted customer access. Provide the link action, access/expiry limitations and recovery. No dummy PDF, storage key or PDF action is required. |
| Both | Validate PDF and link against the same report/provider/VIN/date and fulfill both promised formats, with separate actions. A later link failure does not erase a usable purchased PDF or its access. |
| Neither usable | Never mark fulfilled; use the existing recovery/refund policy. |

Do not silently replace a promised PDF with a link, reinterpret an existing accepted order, or treat one delivered format as completing a promise of both. Any revised delivery agreement requires explicit customer acceptance within the existing recovery/refund policy, retaining the original promise and audit history. Transport failure or reopening must not create another provider purchase or customer payment.

Private current-session, capability, assignment and object authority applies to every association, read and action. Preserve provider originals, dates, provenance and use/redistribution rights; show known original dates before acceptance. Reopening an existing purchase remains free. Archive reuse, rights removal, cleanup/restoration and notifications must respect the actual artifact format and current access; Carberk cannot recall external copies or promise provider-link permanence.

## Consequences

### Positive

- A validated link-only purchase can complete without fabricating a PDF; a PDF-only purchase can complete without a dead link action.
- Customers and operators can assess fulfillment against a recorded promise rather than an assumed universal artifact pair.

### Negative / accepted costs

- Quote, validation, customer/native delivery and recovery tests must cover PDF-only, link-only, both, neither usable, mismatches and later access failures.
- Link-only delivery depends on external access and expiry; failure requires recovery under the accepted promise, not automatic substitution or another charge.

### Neutral

- Existing provider-count, refund, private-access, rights and commercial-activation gates remain. No live provider/payment operation, production rollout or original sample publication is authorized.
- Home #1263 and the public educational PDF sample remain separate allocations; this decision adds no implementation-wide dependency.

## Alternatives considered

- **Always require PDF plus link** — rejected by the founder because the explicitly accepted format can be PDF only or link only.
- **Accept any available artifact after payment** — rejected because it silently changes the customer's promise and could disguise incomplete delivery.
- **Treat links as Admin intake only** — rejected because an approved usable link alone may fulfill an explicitly agreed link-only paid order.

## References

- [Founder-approved format matrix](https://github.com/Carberk/carberk/issues/1174#issuecomment-6891009608) and [criteria reconciliation #1273](https://github.com/Carberk/carberk/issues/1273).
- [ADR-0106](0106-service-owned-support-and-vehicle-history.md), [Vehicle History policy](../prd/features/53-vehicle-history.md), [service flow](../prd/flows/68-service-requests.md) and [workspace design](../prd/ui/service-workspace.md).
