# Background worker

The worker consumes queued work outside the API request path. Native direct-message push, sign-in email, expired-account purge and retired upload cleanup have implementations. Video transcoding and broad orphan cleanup are not implemented. Their registered processors reject jobs permanently and log an error instead of reporting success. They remain registered to reject queued or external work visibly; retries cannot supply the missing implementation. Failed-job retention follows the producer's BullMQ options, so operators must inspect failures/logs and explicitly requeue appropriate work after implementation.

The API owns push eligibility and history creation. The worker delivers per token and updates delivery outcomes. Android uses FCM and iOS uses direct APNS behind the push port; preserve invalid-token classification and retry behavior. Provider code existing in Git does not prove deployed credentials or real-device delivery.

Sign-in email uses Resend behind the email port and daily-send cap. Keep credential material and codes out of error/log payloads. Account purge is distinct from broad media orphan cleanup; do not remove its scheduler or privacy-preserving deletion behavior while cleaning scaffolds. The purge job is also the retention job for Sign-in Code records: at purge it deletes the User's `otp_requests` rows (theirs by User id, and signed-out requests to their phone or email) and clears `contactPhone` on the Listings it keeps, and on every daily run, even when a purge fails, it deletes every `otp_requests` row older than 30 days. The privacy policy states those 30 days.

Retired upload cleanup ([ADR-0088](../../docs/adr/0088-exclusive-upload-adoption-and-retirement.md)) is not the broad orphan sweep, which stays unimplemented. The API retires an upload and records work in `media_upload_cleanups`; a scheduler on the `retired-upload-cleanup` queue runs one bounded sweep a minute. A sweep first retires preparations stranded past their deadline, then takes due `PENDING` work. It deletes only a fenced (`conditional-v1`) upload's exact nine-object manifest inside its own `pending/<UUID v4>/` directory, and only while the upload is retired and no Listing media key, poster or Profile Photo key remains under that directory; the worker repeats that rule itself and does not trust the recorded row. Work is marked done only after every key answers HEAD with "not found". The store deletes nothing unless bucket versioning is off, and fails when it cannot read that state, because a delete on a versioned bucket keeps the bytes. Attempts, the next attempt time and the last failure are saved in Postgres before any deletion starts, so retries survive failures and restarts; BullMQ only triggers sweeps. `LEGACY_PENDING` work is never taken, so legacy bytes stay. It uses the worker's existing `MINIO_*` settings and the `listing-photos` bucket. A green suite proves this against the CI MinIO only: the deployed provider's conditional-write and versioning behaviour is a release check a person runs.

Read the queue processors and their tests for payload/retry behavior. Environment validation controls the transport; test/unconfigured transports are not production delivery evidence.

## Start here

- [Queues and composition](src/app.module.ts)
- [Push delivery and tests](src/push/application/ProcessDirectMessagePush.ts)
- [Email delivery and tests](src/email/application/SendSignInCodeEmail.ts)
- [Account purge and tests](src/jobs/PurgeExpiredAccounts.ts)
- [Retired upload cleanup and tests](src/jobs/CleanRetiredUploads.ts)
- [Transport configuration](src/env.schema.ts)
- [Push architecture](../../docs/adr/0043-native-apns-delivery-via-node-apn.md)
- [Email architecture](../../docs/adr/0055-resend-sends-sign-in-codes-from-the-worker.md)
