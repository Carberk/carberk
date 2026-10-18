# Attachment audience expiry before cleanup

Prepared 2026-10-18. ServiceMessaging's generic private-file reader now checks the stored category's current rights schedule before fetching bytes. Previously current Session, audience, adoption and lifecycle were checked, but an expired adopted attachment could remain downloadable until asynchronous cleanup.

The upload-intent `expiresAt` remains distinct from adopted-content policy. Expired `until` schedules, overdue permitted-knowledge review, malformed/misclassified rights and Support attachments more than 90 days after case closure are denied. A recorded storage hold does not expand the ordinary customer/staff audience. Provider HistoryArtifact reads retain their independent existing rights checks.

Two focused tests were observed red for the absent guard, then green after implementation. All eight ServiceRights tests, API typecheck and affected lint passed. A real hosted HTTP fixture now keeps the adopted bytes and a storage hold present while advancing the read schedule to expiry, and requires 403 before cleanup. This new hosted assertion has not yet run locally; no local Docker/database suite was invoked. The earlier assembled ServiceMessaging nine-test suite passed hosted on root's 8897ae46 candidate before this follow-up, according to `/tmp/carberk-api-8897ae46.log` at line 1768.
