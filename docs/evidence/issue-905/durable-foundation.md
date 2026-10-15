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


## Bootstrap composition continuation

Actual Fastify bootstrap404red ef134f20 became six green HTTP cases after implementation. Strict request schema accepts only the existing visit ID; JWT and separately redacted scoped guest proof supply identity. Responses use no-store, invalid body metadata fails generically, and guest erase returns no existence counts. Disabled collection still permits guest erasure. The purpose-gated application has independent defaultclosed/realpopulation refusal evidence.

Activation prerequisites and actual logger credential redaction red1fb3a967 produced two behavior failures and47 existing passes, followed by green. The new module is installed in AppModule with collection defaultfalse. Enabled test fixtures require an external collector epoch and evidence reference. Its composition additionally restricts issuance to APP_ENV=test until trusted population admission exists. Hardcoding every public guest as synthetic in a deployed environment would be unsafe and is explicitly prevented. This restriction is an implementation gate, not a new product scope decision.

Full bootstrap checks: contracts553 tests, API2153 passes with2 existing skips, API/contracts TS7/lint, mobile TypeScript and runtime-import gate pass. Focused bootstrap/application/logger/environment57 tests pass. No dependencies or live environment settings changed. Actual PostgreSQL results remain assigned to hosted integration evidence.


## Trusted staging synthetic admission

The test-only intermediate restriction above is superseded by bounded deployed synthetic admission. After inspecting the #901 fixture marker and reset safeguards, the implementation uses the approved alternative of a scoped operator bootstrap proof. A random32-byte ms_ capability is sent only in the redacted X-Measurement-Synthetic header. Protected configuration holds only its SHA-256 digest and UTC expiry. Constant-time comparison requires the exact proof, staging environment, future expiry no more than24hours away, collection activation evidence and an external collector epoch. It grants no sign-in, data access or ordinary application authority. It never enters event envelopes, stored measurement identities or response bodies. Production bootstrap remains disabled. Existing staging identity resolution and receipt also stop at expiry; guest erasure remains available.

Admission/redaction red33fb974d had two behavioral failures; same tests pass after implementation. Actual Fastify HTTP proves public refusal, exact proof admission, no proof leakage into identity arguments or response, and credential separation. Focused admission/HTTP/logger/environment58 tests pass. A broad module-targeted Vitest command also picked up actualPG specs and failed because no local DB exists; those setup failures do not count as behavioral red or SQL runtime proof. Correct unit-only verification follows. No Docker started, protected deployment variable changed, capability generated for live use or real collection enabled.

Coordinated SERVICE_SYNTHETIC_ENABLED defaultfalse was added for #903. Its module import awaits that verified module checkpoint.

Hosted assembled candidate0c716fa48141989f8e61fa035089534d4c71ac5f subsequently passed full PRChecks38693824925 and APIimage38693824914. Chief of Staff inspected the log and confirmed all five PrismaMeasurementStore actual PostgreSQL scenarios and all four PrismaAccountDeletionUnitOfWork cases executed without skips. This supplies durable runtime green for that candidate; no independent SQL behavioral red exists. Scoped synthetic follow-up checks pass2156 API unit cases with2 existing skips, TS7/TS6/lint and docs gates. Later deployed synthetic activation still requires reserved staging evidence and restoration.
