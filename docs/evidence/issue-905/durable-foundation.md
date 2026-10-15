# #905 durable foundation checkpoint

This extends the unwired interim contract. It does not finish #905 or enable collection. Shared schema-only checkpoint a9319373 was separately supplied to the assembly writer. Previous migration bytes remain unchanged.

The new principal, immutable visit, raw record, source outbox and collector-state tables have cascading erase relationships. Account principals have an erasable account mapping; guest credentials persist only as SHA-256 digests and expire at ninety days. A current guest visit may link to the separately issued account principal. Erasing that account removes only its linked guest visit, without adopting earlier guest visits. No actor mapping survives in a tombstone. Source outbox rows reserve the original generation, epoch, population and environment for later atomic source composition.

The durable adapter issues visits at foreground bootstrap, never during ingress. It locks the collector state and principal before event-ID insertion, checks an existing visit belongs to that exact principal, and tests event time against the original foreground window. Delivery does not advance foreground activity. Account bootstrap locks the core account row to serialize against deletion scheduling. Identity's existing deletion transaction now erases account principals with cascading raw/outbox/current-guest-visit deletion. Existing personal versus business stock filters are preserved.

Restore protection requires a newly supplied external epoch before serving and collector-wide removal of old identities, raw records and queues, followed by core deletion replay. The adapter refuses a mismatching stored epoch. Its rotation operation removes all old actor maps and rejects reuse of the currently stored epoch. Neither a backed-up epoch nor an unchanged environment variable can detect a restore by itself. Operational restore wiring and deployed proof remain required.

## Evidence

- Identity resolver deadline red5e3f033b, one actual behavior failure and three HTTP passes; greenf1c83bed, four HTTP passes.
- Foreground visit policy red5e9b6d89, three behavior failures and one pass; same four tests green after implementation. Cases cover idle boundary, account switch, closed visits, clock rollback, original generation/time bounds and late delivery without foreground renewal.
- Full API unit217 files,2147 passes and2 existing skips. API TS7/lint and runtime-import gate pass. DB generation/build/typecheck/lint and97 unit tests pass. Two exact-byte schema/profile compatibility tests pass.
- Five real PostgreSQL adapter scenarios cover concurrent dedupe, unknown visits, deletion/receipt races and recovered-account queue fences, current-only guest association, ninety-day expiry/guest erasure, and restored revoked principal/visit rows. The owning identity suite adds actual DeleteMe rollback and cascading erase assertions.

Actual PostgreSQL scenarios and their behavioral red checkpoint have not run locally. PostgreSQL binaries are unavailable and local Docker was intentionally not started. These are missing evidence, assigned to hosted integration CI, not passes inferred from types, fake ports or SQL inspection. Prisma generation and migration/profile checks validate shape and reviewed bytes only.

Remaining #905 work includes installed bootstrap/HTTP composition, actual persisted mobile host and rendered core-action outage proof, authoritative source transaction/outbox integration, distributed caps, retention and complete trilingual actual-field disclosures/rights/activation evidence. Raw diagnostics are separately owned. Collection, external telemetry and real populations remain disabled. No native session, staging mutation or external service activation occurred.
