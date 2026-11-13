# Vehicle History

This context owns private customer enquiries and the empty synthetic operator desk. Customer create/list/detail use-cases check the current requester through identity's public session/read/check ports; they require neither staff grants nor TOTP. Staff authority remains identity-owned and independent. There are no orders, messages, wallet/provider calls or live intake.

Start with the [customer HTTP boundary and database tests](presentation/HistoryRequestsController.e2e.spec.ts) or the [staff desk](presentation/VehicleHistoryController.ts). Entry defaults off, requires explicit local synthetic tester admission, and always refuses staging/production. A requester-scoped attempt key preserves retries; a new request uses a new key. Source Listing IDs are immutable untrusted context, not foreign keys or authority; later Listing changes/deletion cannot rewrite the enquiry.
