# Vehicle History

This context owns private customer enquiries and assignment authority. Customer create/list/detail check the current requester through identity's public session/read/check ports; they require neither staff grants nor TOTP. Assigned public identity comes through IdentityReadPort. Staff session/TOTP/lifecycle/exact-purpose authority remains identity-owned through StaffAccessPort. It also owns explicit synthetic order acceptance. There are no wallet/provider calls or live intake.

Start with the [customer HTTP boundary and database tests](presentation/HistoryRequestsController.e2e.spec.ts) or the [staff desk](presentation/VehicleHistoryController.ts). Entry defaults off, requires explicit local synthetic tester admission, and always refuses staging/production. A requester-scoped attempt key preserves retries; a new request uses a new key. Source Listing IDs are immutable untrusted context, not foreign keys or authority; later Listing changes/deletion cannot rewrite the enquiry.

The [operator HTTP boundary](presentation/HistoryAssignmentController.ts) exposes
unassigned/mine public enquiry metadata and DB-arbitrated versioned claims.
[Queue projection](application/HistoryQueueProjection.ts) consumes Identity's
public batch port over History-owned candidates for complete name/reference
search, keeping requester IDs internal. Only the current assignee can read the
distinct selected operator context; delayed projections recheck authority and
assignment. Uncertain same-owner retries do not increment the version again.
The same operator boundary lists eligible named synthetic colleagues and moves one
currently assigned enquiry at its exact version. Old assignees lose selected and
private access; the customer retains the request. The old desk response stays empty.

[Message HTTP](presentation/HistoryMessagesController.ts) uses business messaging's public port for exact-text sends and ascending bounded pages. History retains a request row lock and Identity's public authority fence through each operation, rechecking identity after lock waits and enforcing requester or current assignee/version. Separate lock pools leave operation connections available. Messages expose public authors and Sent facts. The receipt HTTP boundary uses the same current-authority fence and returns received/read orders attributed to actual participants and assignment versions, with requester version 0. Only explicit acknowledgements advance them; fetching alone does not. Connected customer/operator UI remains separate.

[Waiting policy](domain/HistoryWaiting.ts) owns UTC/replay/suppression facts.
The locked semantic facet saves on the request connection, retaining Identity's public fence through commit.
[Synchronization](application/SyncHistoryWaiting.ts) settles the request-keyed once outcome before replaying every ascending public page around ordinary sends, without receipt offers.
The [server lifecycle port](vehicle-history.public.ts) uses current authority and source versions; same-context lock holders use its already-held path.
[Reminder HTTP](presentation/HistoryRemindersController.ts) exposes safe current-authority
readback, permanent requester Stop and one manual operator reminder after 24 hours.
It reconciles without participant fetch/ACK effects and preserves the original
once outcome across retries. Actual controls remain #1222 and connected completion
#1178; VIN/offer preview consumers use a separate request-bound state. No automatic reminder or outbound action.

[Offer HTTP](presentation/HistoryOffersController.ts) stores VIN review and explicit-format proposal previews on the existing request/Identity transaction. The provider port admits only fixed synthetic VIN fixtures, without egress. Rechecking VIN clears a proposal; version conflicts require readback. Customer and Admin consumers expose original dates and proposed terms. [Order HTTP](presentation/HistoryOrdersController.ts) requires the customer's exact displayed offer and version before creating one immutable accepted snapshot per request. It uses the same request/Identity commit fence and serializes cross-request hold capacity. Two-hour expiry is read from persisted UTC facts and excludes expired holds from capacity without a worker. Synthetic staff/day/window and next-morning limits default to zero; wallet instructions accept controlled SYNTHETIC-only configuration. Neither the UI nor API collects money. Paid booking/FIFO/provider allowances remain separate.

[Payment proof HTTP](presentation/HistoryPaymentProofsController.ts) stages bounded synthetic receipt images against the immutable accepted order. It uses a distinct private S3-compatible bucket, conditional immutable bytes and request/Identity fences through submission and reads. Submission never confirms funds or renews a hold. [Cleanup](application/CleanupHistoryPrivateFiles.ts) retries exact-key deletion of abandoned staging after 24 hours; submitted evidence has no invented retention period. Active-assignee reads and separately granted, reasoned/audited historical exact-object reads are distinct. Storage supports no public URL or generic export. Reports and live lifecycle policy remain separate slices.
