# Business messaging

Owns service text, sender-scoped intent deduplication and durable stream ordering ([ADR-0106](../../../../../docs/adr/0106-service-owned-support-and-vehicle-history.md)). Listing Conversations and History request/assignment policy remain separate.

Consume only [the public port](business-messaging.public.ts) through [the module](business-messaging.module.ts). This internal boundary authenticates nobody: History must validate current requester/assignee/session/version and retain its authority fence through every external read/send/retry. There is no HTTP adapter or live entry here; persistence establishes Sent only.

[The exported-port Postgres proof](business-messaging.e2e.spec.ts) exercises concurrency and scoped pages. Text equality is exact, preserving whitespace/newlines; only UUID keys are canonicalized. The stream row lock serializes order allocation through commit. Explicit received/read acknowledgements retain participant and assignment-version facts. Transcript reads only record a contiguous fetched range for the current participant/session/version; they never acknowledge receipt. Read cannot exceed received, and acknowledgements cannot exceed that fetched range. No private notes, identity enrichment or retention schedule is introduced.
