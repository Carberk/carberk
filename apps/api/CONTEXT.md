# API

The API owns business use-cases, HTTP transports, and authenticated chat sockets. The [context map](../../CONTEXT-MAP.md) routes to each owning module. Follow [domain boundaries](../../docs/agents/domain.md) when changing cross-context behavior.

HTTP authentication uses bearer tokens. Browser cookie storage and forwarding belong to the admin app. External push and sign-in email delivery belong to the worker; API notifications decide eligibility and enqueue work. SMS has a separate gateway boundary.

Feature modules import the shared Prisma module; database access is already wired. The old commented root import is not evidence of a pending ESM migration. Runtime packages follow the [compiled-package contract](../../docs/agents/typescript-runtime.md).

`/healthz` is dependency-free liveness and deploy identity. `/readyz` checks Postgres, Redis, and MinIO with bounded probes; failures must not leak raw errors. Deployment and reviewer-demo flags are validated in the environment schema. A local test flag is not permission to enable it in staging or production.

Rate limits key on the caller, not the proxy hop. `resolveClientIp` (`src/common/client-ip.ts`) is the only place the API derives a client IP: it reads the one header named by `CLIENT_IP_HEADER`, default Railway's `X-Real-IP`, and ignores a client-supplied `X-Forwarded-For`. The Sign-in Code per-IP budget and the global throttler both use it. When the header is missing or unusable the request counts against the peer address, and `ClientIpThrottlerGuard` logs `client_ip.peer_fallback` at most once every ten minutes. Any other ingress in front of the API must set or overwrite that header, or callers choose their own budget ([ADR-0078](../../docs/adr/0078-the-api-trusts-one-configured-header-for-the-client-ip.md)).

Cloud deployment follows ADR-0039. Only the API pre-deploy command owns production schema migration.

## Start here

- [Bootstrap and module composition](src/app.module.ts)
- [Environment validation](src/env.schema.ts)
- [Health and readiness](src/common/health.controller.ts)
- [Readiness implementation](src/common/readiness.ts)
- [API integration tests](test)
- [Deployment contract](../../docs/adr/0039-phased-cloud-first-hosting.md)

`PHOTO_CONVERSION_MAINTENANCE=true` starts only health listeners for the [photo conversion runbook](../../packages/db/scripts/convert-photos-webp.md). Business HTTP routes return 503 and no Socket.IO server starts. `/readyz` identifies maintenance with business readiness false while allowing the deployment health check to replace old writers.
