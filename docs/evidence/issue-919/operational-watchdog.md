# Operational watchdog implementation evidence

Prepared 2026-10-18. This is software preparation, not deployed monitoring or alert-delivery acceptance.

## Delivered behavior

`OPERATIONS_ENABLED=false` is the default. When explicitly enabled with `REDIS_URL` and a deployment-specific `OPERATIONS_SCOPE`, the core worker writes a timestamp every 15 seconds with a 45-second Redis TTL. Heartbeat failures neither block business operations nor emit private Redis error content.

`pnpm --filter @auto-tm/worker start:watchdog` starts a separate process. Deploy it separately from the worker. It observes the API's `/readyz`, a separately configured collector health endpoint, the real worker heartbeat and fixed BullMQ queue counts every 30 seconds. Maintenance readiness is denied even when HTTP returns 200. Probe redirects are denied; API bodies are bounded to 4096 bytes and requests to three seconds. No queue payloads, requests, customer identifiers, exception bodies or endpoints appear in snapshots.

Configure `OPERATIONS_API_HEALTH_URL` to the intended deployed `/readyz`. Configure `OPERATIONS_COLLECTOR_HEALTH_URL` to a real collector health endpoint only after collector deployment. Missing endpoints produce unknown, which cannot resolve an existing incident. The Redis snapshot expires after 90 seconds; readers must treat missing or stale snapshots as unknown.

Backlog over 100 must remain observed for ten minutes. Observation failure or a gap longer than 60 seconds restarts that duration. Incident original age survives outside staffed coverage. Error rate requires a complete five-minute window and at least 100 requests; low-volume errors remain unknown. Independently observed outages remain actionable. Staffed deadlines use weekdays 08:00–20:00 Asia/Shanghai. Budget warnings begin at 80 USD for Railway and 6400 TMT for TM, without authorizing spending or shutting down core services.

## Checks

- Nine focused policy, watchdog and real local HTTP tests passed. They include maintenance rejection, redirects, bounded response bodies, lost worker heartbeat, observation gaps, unknown dependency recovery and staffed-hour calculations.
- One actual Redis/BullMQ test is prepared in `Watchdog.e2e.spec.ts`. It runs only in hosted CI against admitted CI Redis. Locally skipped; no local Docker or destructive DB suite was run.
- Worker typecheck and affected ESLint passed. Frozen offline workspace install restored an already-declared fontkit package; no dependency version changed.

Docs: https://github.com/redis/ioredis/blob/v5.10.1/README.md verifies explicit reconnect and disabled offline queue behavior for installed ioredis 5.10.1. Installed types verify command timeout options.

Docs: https://github.com/taskforcesh/bullmq/blob/v5.76.8/src/classes/queue-getters.ts verifies fixed-state `getJobCounts` behavior for installed BullMQ 5.76.8. The generated API documentation endpoint failed TLS hostname verification; no TLS bypass was used.

## Remaining acceptance

Actual independent deployment, deliberate worker death, actual collector failure, receipt of a real authorized alert, deployed metrics thresholds, monitored-disk coverage, TLS observation and resource isolation remain unverified. Disk/TLS probe software is implemented below; collector/resource configuration is separate from deployed proof. A watchdog cannot prove its own independent availability. Native diagnostic SDK collection, release symbolication, sanitization and deletion fences remain separate obligations. The legacy Compose monitoring configuration supplies no deployed evidence. Nothing here enables service/provider collection, production or paid provisioning.

Technical metrics thresholds now have software implementation and focused proof below; deployed observation remains missing.

## Safe staff health reader and workspace

The separate OperationsModule exposes `GET /api/v1/operations/health`. The root API must compose this module. Current elevated `analytics.aggregate` authority is checked before infrastructure access and again before response release. Responses use `Cache-Control: no-store`. A strict shared contract rejects unexpected private fields, unknown queues, malformed counts, stale or future evidence. Absent evidence is unavailable, never an inferred healthy state.

`/operations` is a separate TK/RU/EN workspace with current probes, bounded queue counts, original incident timing and explicit missing billing/recovery/native evidence. It clears prior data on refresh/denial and expires displayed evidence after 90 seconds. Budget ceilings are policy text; no current spending is invented. Root owns navigation linkage and independent final browser/keyboard acceptance.

Six API behavior/real JWT HTTP checks and six rendered actual-component/server-action checks passed. They cover missing/revoked Session, grant/elevation denial, current no-store reads, stale/future/private payload rejection, all three locales, revocation clearing, missing evidence and displayed snapshot expiry. API/admin typechecks and affected lint passed. Real production identity/storage deployment remains outside these synthetic HTTP checks.

## Nonblocking technical counters

The operations module registers actual Fastify request/response hooks when explicitly enabled. Each request records only response status and duration into at most 61 ten-second aggregate buckets with fixed histogram bins. Guard-level failures are included. Health/readiness/operations probes are excluded so monitoring traffic cannot manufacture the denominator on a quiet service. No route, request body, actor, header or exception is retained by these counters.

Redis flush occurs every 15 seconds outside request handling, with no overlapping flushes and a 45-second TTL. A complete five-minute window and 100 requests are required before an error rate is known. Only 5xx responses are technical errors. A complete ten-minute window and 100 requests are required for the p95 histogram upper bound. The independent watchdog validates fresh metric snapshots and opens incidents above 5% technical errors or above 2000 ms p95 upper bound. Missing/stale measurements cannot close an incident. Multi-process metrics aggregation is not established by this single-process implementation.

Four additional API tests passed, including an actual HTTP hook test counting 200/400/guard-level 500 while excluding readiness probes. An additional watchdog test covers measured technical thresholds, stale metrics and recovery. API/worker/admin typechecks and affected API/admin lint passed; worker import-order correction receives its affected lint rerun before checkpoint. Existing six rendered tests remain green with explicit unknown metrics before evidence exists.

## Disk and TLS probes

The independent watchdog now measures an explicitly configured `OPERATIONS_DISK_PATH` with a bounded filesystem read, reports free capacity and fails below ten percent. An absent path, failed read or invalid filesystem stats stays unknown. Only one pending filesystem read is admitted, so a hung mount cannot accumulate threadpool reads. This path must actually mount the intended monitored filesystem. A Railway watchdog rootfs measurement cannot establish separate managed Postgres/media volume capacity.

The TLS probe performs a real handshake against the configured HTTPS API endpoint with hostname/chain validation enabled and a three-second deadline. It fails when expiry is less than fourteen days, the peer cannot be authenticated or the connection fails. Only state and expiry reach the snapshot, never certificate subject, endpoint or raw TLS error. Missing/non-HTTPS targets stay unknown. Unknown monitored disks/TLS cannot resolve an open incident.

Actual local TLS-server fixtures with generated certificates prove one-day expiry fails, thirty-day expiry is healthy and an untrusted certificate fails. Deterministic filesystem-boundary fixtures prove below-ten-percent and exact-ten-percent behavior. Eight focused worker tests and six rendered TK/RU/EN admin tests passed. The staff view shows missing disk/TLS evidence as unknown and explains the measured mount limitation. Actual deployed volume coverage, TLS routing and resource enforcement remain acceptance evidence.
