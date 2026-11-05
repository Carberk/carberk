# `infra/compose/`

Docker Compose files. Created during code scaffolding session.

## Planned files

| File | Purpose |
|---|---|
| `docker-compose.dev.yml` | Local development — Postgres + Redis + MinIO + Mailpit (for testing) + app containers in watch mode |
| `docker-compose.prod.yml` | Production deployment to TM servers — full stack with healthchecks + restart policies |
| `docker-compose.observability.yml` | Prometheus + Grafana + Loki + Promtail + GlitchTip (lives on Server B) |
| `docker-compose.test.yml` | Spawns minimal Postgres + Redis for integration tests (used by Testcontainers fallback) |

## MinIO data contract

Local and TM-era Compose files mount MinIO's single data path at `/data`
(`minio-data:/data` in development, `/srv/auto-tm/minio:/data` in TM
production). Do not add a second object-data mount; backup/restore tooling
assumes the full object store lives under that one persistent path.

All three MinIO services use digest-pinned Chainguard images under
[ADR-0074](../../docs/adr/0074-digest-pinned-chainguard-minio-images.md).
Development and TM production use the minimal image. CI uses the dev image
because its health probe runs `wget` through a shell. The entrypoint remains
`/usr/bin/minio`, with `server /data` as its command. Mounted-volume services
explicitly run as `0:0` so fresh and previously root-owned data stays writable.
Preserve the volume and ownership when replacing the image.

Bucket creation and policy reconciliation are explicit, not an API boot
side effect. Listing videos remain private during the rollout hold; bootstrap
removes their old anonymous grant without deleting bytes. Photo/chat reads and
the catalog `brands/*` grant stay public:

```sh
pnpm compose:up
pnpm minio:bootstrap
```

The same endpoint variables drive the backup/restore scripts:

```sh
pnpm minio:backup /tmp/autotm-minio-backup
pnpm minio:restore /tmp/autotm-minio-backup
```

## Service catalog (production)

```
Server A:
  - api          (apps/api)
  - admin        (apps/admin)
  - web          (apps/web)
  - worker       (apps/worker)
  - postgres     (primary)
  - redis
  - minio
  - caddy        (reverse proxy + TLS)

Server B:
  - sms-gateway  (apps/sms-gateway)
  - phone-agent  (×N — runs on physical phones, not in Docker)
  - postgres-replica
  - prometheus
  - grafana
  - loki
  - promtail
  - glitchtip
```

## Networking

- Server A internal: `auto-tm-internal` bridge network — only Caddy exposes ports externally
- Server A ↔ Server B: Telecom-local network (no public exposure)
- Caddy publishes: 80 (HTTP → HTTPS redirect), 443 (HTTPS for all subdomains)

## See also

- [ADR-0005 — Hosting](../../docs/adr/0005-hosting.md)
- [Deployment runbook](../../docs/prd/ops/80-deployment-runbook.md)
- [Monitoring + alarms](../../docs/prd/ops/81-monitoring-alarms.md)

## Conditional Listing image storage

The optional `conditional-v1` upload protocol requires an unversioned `listing-photos` bucket and working conditional PUT semantics. The API checks versioning and probes uniquely owned scratch keys before new authority or conditional generation; denied/unknown/versioned/unsupported storage fails closed. Never change live bucket configuration to satisfy a test. Hosted proof uses the CI digest from `docker-compose.ci.yml`; it does not establish support for the different dev/prod digest or the deployed media origin. Deployment versioning/permissions and actual native PUT proof remain operator-owned release evidence.

Shipped Listing PUT callers are native Expo and the Node smoke script. A future browser caller also needs deployed CORS permitting PUT and `if-match`/`content-type`/`cache-control`; no CORS configuration is changed by this implementation. Legacy upload/generation remains compatible and supplies no conditional deletion guarantee. See [ADR-0088](../../docs/adr/0088-exclusive-upload-adoption-and-retirement.md).

Conditional objects carry signed `Cache-Control: no-store` from initialization through original/variant writes. This controls new compliant origin/intermediary delivery caching; stored-object deletion does not erase offline or third-party copies. Existing cached legacy objects are outside that guarantee, and deployed delivery headers must be verified during operator release proof. Catalog-logo immutable caching remains separate.
