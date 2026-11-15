# Vehicle History

This context owns private customer enquiries and assignment authority. Customer create/list/detail check the current requester through identity's public session/read/check ports; they require neither staff grants nor TOTP. Assigned public identity comes through IdentityReadPort. Staff session/TOTP/lifecycle/exact-purpose authority remains identity-owned through StaffAccessPort. There are no orders, wallet/provider calls or live intake.

Start with the [customer HTTP boundary and database tests](presentation/HistoryRequestsController.e2e.spec.ts) or the [staff desk](presentation/VehicleHistoryController.ts). Entry defaults off, requires explicit local synthetic tester admission, and always refuses staging/production. A requester-scoped attempt key preserves retries; a new request uses a new key. Source Listing IDs are immutable untrusted context, not foreign keys or authority; later Listing changes/deletion cannot rewrite the enquiry.

The [operator HTTP boundary](presentation/HistoryAssignmentController.ts) exposes
unassigned/mine public enquiry metadata and DB-arbitrated versioned claims.
[Queue projection](application/HistoryQueueProjection.ts) consumes Identity's
public batch port over History-owned candidates for complete name/reference
search, keeping requester IDs internal. Only the current assignee can read the
distinct selected operator context; delayed projections recheck authority and
assignment. Uncertain same-owner retries do not increment the version again.
The old desk response stays empty for its existing Admin consumer. Actual inbox,
native assigned header/composer and handover remain separate delivery slices.

[Message HTTP](presentation/HistoryMessagesController.ts) uses business messaging's public port for exact-text sends and ascending bounded pages. History retains a request row lock and Identity's public authority fence through each operation, rechecking identity after lock waits and enforcing requester or current assignee/version. Separate lock pools leave operation connections available. Messages expose public authors and Sent facts. The receipt HTTP boundary uses the same current-authority fence and returns received/read orders attributed to actual participants and assignment versions, with requester version 0. Only explicit acknowledgements advance them; fetching alone does not. Connected customer/operator UI remains separate.

[Waiting policy](domain/HistoryWaiting.ts) owns UTC/replay/suppression facts.
The locked semantic facet saves on the request connection, retaining Identity's public fence through commit.
[Synchronization](application/SyncHistoryWaiting.ts) settles the request-keyed once outcome before replaying every ascending public page around ordinary sends, without receipt offers.
The [server lifecycle port](vehicle-history.public.ts) uses current authority and source versions; same-context lock holders use its already-held path.
[Reminder HTTP](presentation/HistoryRemindersController.ts) exposes safe current-authority
readback, permanent requester Stop and one manual operator reminder after 24 hours.
It reconciles without participant fetch/ACK effects and preserves the original
once outcome across retries. Actual controls remain #1222 and connected completion
#1178; quote consumers remain separate. No automatic reminder or outbound action.
