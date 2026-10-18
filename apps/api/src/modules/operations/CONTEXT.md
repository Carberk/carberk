# Operations health

This context exposes a bounded, current operational snapshot through `GET /api/v1/operations/health`. It requires current elevated `analytics.aggregate` authority before and after the Redis read, sends `no-store`, validates a closed schema and rejects stale/future evidence. Missing or unreachable evidence remains unavailable.

Fastify hooks collect status/duration counts without request URLs, bodies, actors or headers. The API flushes bounded technical buckets asynchronously. An independent worker watchdog probes actual readiness, collector health, worker heartbeat, fixed queue depths, explicit monitored-disk capacity and actual API TLS expiry; it publishes short-lived snapshots for the TK/RU/EN admin `/operations` view. `OPERATIONS_ENABLED` defaults closed. Per-process API buckets currently do not establish a multi-replica aggregate, and watchdog incidents do not persist across process restart.

Software preparation does not establish a running collector, actual alert delivery, platform resource enforcement, backup restore or billing evidence. The worker hosting-readiness CLI assesses supplied receipts without authenticating them and never authorizes activation. The monitoring and hosting specifications own those acceptance gates.

## Start here

- [Read use-case](application/ReadOperationsHealth.ts), [HTTP boundary](presentation/OperationsController.ts) and [authority tests](application/ReadOperationsHealth.spec.ts)
- [Technical HTTP hooks](presentation/TechnicalHttpMetrics.ts) and [counter implementation](infrastructure/TechnicalMetrics.ts)
- [Independent watchdog](../../../../worker/src/operations/Watchdog.ts) and [entrypoint](../../../../worker/src/operations/watchdog.main.ts)
- [Hosting evidence assessor](../../../../worker/src/operations/HostingReadiness.ts)
- [Admin health view](../../../../admin/src/app/operations/OperationsWorkspace.tsx)
- [Monitoring specification](../../../../../docs/prd/ops/81-monitoring-alarms.md) and [hosting evidence](../../../../../docs/evidence/issue-920/hosting-readiness.md)
