# Listing-view fingerprint retention #899

Worker-only checkpoint for campaign #897, based on `4860aa08cc45d530fb88a4c8ebf6eb3a7a06fa3e`, incorporating #874 schema/expiry. No API/schema/contracts changes and no deploy, Docker or device session.

| Criterion | Evidence | Result |
|---|---|---|
| Delete due fingerprints only; bounded backlog, repeat, boundary | Real sweep unit tests and actual Prisma SQL adapter; hosted PG suite includes concurrent fresh insertion/current-day unique constraint and full Listing/daily readback | unit pass; hosted PG pending CI |
| Actual minute scheduler, startup catch-up, bounded retries and health | Real scheduler/processor tests, AppModule provider composition, hosted actual Redis retry test | local pass; hosted Redis pending CI |
| Preserve purge/upload schedules | AppModule retains both and composition test asserts providers | pass |
| Retention age and failure visibility | Immutable API expiry, schedule/execution bounds below, aggregate logs and sanitized retryable failures | implementation pass; deployed runtime evidence pending |
| No identifiers/secrets in logs/job data; no extra credentials | Empty scheduler/startup data, aggregate-only result and generic error, direct sentinel test | pass |

## Red/green checks

Pushed red `06ecea46` before production implementation. The same three `ExpireListingViewFingerprints.spec.ts` behavior tests failed against an inert sweep: due deletion, bounded backlog/health and outage refusal. Green now adds execution-budget coverage and passes four. Real scheduler/processor tests add three and exercise replica coalescing, actual AppModule composition, real sweep processing, retryable outages and sanitized logs.

`pnpm --filter @auto-tm/worker test:unit`:20 files/206 tests pass. Worker TS7/TS6 no-emit, lint with zero warnings, and Nest build pass. Contracts/DB generated build outputs were prepared locally using a nonconnecting placeholder DATABASE_URL. No database connection/mutation was made by those builds. Full repository/hosted integration and independent review belong to the parent integration PR.

`PrismaListingViewRetentionLedger.e2e.spec.ts` executes the actual deletion adapter on hosted disposable loopback PostgreSQL. It inserts expired, exact-boundary and fresh rows, uses batch size1, races a fresh insertion, repeats a sweep, reads back the unchanged entire Listing including updatedAt/viewCount, unchanged daily count17, and proves today's remaining unique fingerprint still rejects a duplicate without extending expiry. Historical2000 timestamps isolate this suite's due rows from other suites' current work. It has NOT run locally.

`listing-view-retention.e2e.spec.ts` uses a unique disposable Redis queue, actual BullMQ Queue/Worker, production scheduler/processor and real sweep with database-boundary fake. It proves one scheduler across concurrent replicas, empty payloads, actual startup trigger/retry and sanitized failure before recovery. It has NOT run locally. Both suites require GITHUB_ACTIONS=true and explicit loopback disposable service origins; NODE_ENV=test alone grants no destructive authority.

## Retention and restart contract

Scheduler ID `listing-view-retention-minute`, queue `listing-view-retention`, every60000ms. Startup also adds empty `sweep` job `listing-view-retention-catch-up`, coalescing simultaneous replicas. Completed/failed catch-up jobs remove themselves so a later restart can trigger again. Scheduled history retains10 completions/100 failures. Both use3 attempts, exponential backoff starting1000ms. Failed or exhausted jobs do not remove PostgreSQL work; next minute retries the remaining rows. No salt or viewer identifier enters this job.

Each sweep uses a fixed UTC now, at most100 batches of1000, stops starting batches at30000ms. PostgreSQL transactions allow1000ms pool acquisition and3000ms transaction execution with2000ms statement timeout. A final indexed oldest-due aggregate is separately bounded. No raw rows cross the adapter boundary. Selection locks due rows using SKIP LOCKED and deletes only their composite keys with expiresAt<=now rechecked. Locked rows remain visible to oldest-overdue health and subsequent sweeps.

API expiry is startOfAshgabatDay(day+2) minus5minutes. Example: an install viewed at2026-10-12T19:00:00Z, local October13 midnight, expires2026-10-14T18:55:00Z. Eligibility age47h55m plus at most5m healthy scheduling/execution deletes by2026-10-14T19:00:00Z, age48h. A late-day view at2026-10-13T18:59:59Z has the same expiry and a shorter lifetime. UTC+5 day changes19:00UTC, no DST. At18:54:59.999UTC boundary-minus1ms stays; at18:55:00UTC exact expiry deletes. Today's ledger expires after its originating day and cannot be swept during that day. Cleanup never modifies immutable expiry, durable daily/lifetime counts or Listing.updatedAt.

One-minute triggering and roughly<=36s bounded execution leave margin inside the5m requirement under healthy queue/DB capacity. That is a conditional service budget, not an unconditional retention guarantee. The100000-row sweep cap can leave a backlog; fixed-minute retries catch up. Aggregate logs include lastSuccessAt, oldestOverdueAt, overdueMs and healthy. Oldest expiry overdue by>=5m, errors or missing last-success heartbeat for5m constitute retention failure. The process never calls an outage successful deletion. An outage can exceed48h; restoration catches up but does not erase the breach. Before enabling LISTING_VIEWS_ENABLED, the release owner must capture candidate runtime sweep evidence and verify operational alerts on stale health/backlog. This checkpoint neither deploys nor claims that evidence.

Docs: https://docs.bullmq.io/guide/job-schedulers read for stable upsert scheduler behavior, checked installed bullmq5.76.8 Queue/JobScheduler types/source. Existing Nest BullMQ wiring remains the integration path. No dependency upgrade. https://www.postgresql.org/docs/current/sql-select.html documents SKIP LOCKED for queue-like consumers and row locks; actual PostgreSQL suite is the execution authority.
