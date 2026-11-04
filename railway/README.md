# `railway/` — per-service declared deploy state

The checked-in declaration of Railway deploy settings for the ADR-0039 cloud
phase (Sprint 11). One JSON file per deployable service, each valid against
<https://railway.com/railway.schema.json>.

**Railway does not read these files.** Railway deprecated config as code
(`railway.json` / `railway.toml`); pointing a service at one is rejected by
the live API. Its replacement, Infrastructure as Code in `.railway/railway.ts`,
covers neither Dockerfile builds nor the API pre-deploy migration, so AutoTM
does not adopt it. Deploy settings are applied provider-side per environment
through `serviceInstanceUpdate`, and these files remain the human- and
agent-readable statement of what those settings should be. Locked in
[ADR-0044](../docs/adr/0044-railway-deploy-settings-live-provider-side.md).

Changing a service's contract is therefore two steps: edit the file here, then
apply it provider-side and record it in the environment's evidence file. Drift
between the two is an operator finding — nothing reconciles it automatically.

| File | Service | Build | Start command | Pre-deploy | Health gate |
|---|---|---|---|---|---|
| `api.json` | `api` | `infra/docker/api.Dockerfile` | `node dist/src/main.js` | `pnpm --filter @auto-tm/db migrate:deploy` | `/readyz` (bounded: Postgres + Redis + MinIO) |
| `worker.json` | `worker` | `infra/docker/worker.Dockerfile` | `node dist/main.js` | — | none (no public route; boot failure exits non-zero) |
| `admin.json` | `admin` | `infra/docker/admin.Dockerfile` | `node apps/admin/server.js` | — | `/healthz` (dependency-free) |
| `web.json` | `web` | `infra/docker/web.Dockerfile` | `node apps/web/server.js` | — | `/healthz` (dependency-free) |

## Production overrides and verification

The JSON files retain the staging sleep settings. For production, apply
`sleepApplication=false` to all seven service instances, including admin and
web whose JSON declarations use `true` for staging. Every other declared
application build/start/pre-deploy/health/restart setting carries over unless a
reviewed change explicitly replaces it. Record provider readback per environment;
these files do not apply any settings automatically.

Production foundation status and outstanding verification live in
[#281 evidence](../docs/prd/ops/evidence/issue-281-production-foundation.md).
The existence of service instances does not establish readiness or authorize
an application deployment. Production must have no branch deployment triggers.

## Migration authority

`api` is the **sole** migration authority. Its pre-deploy command runs
`prisma migrate deploy` (via `packages/db/prisma.config.ts`, forward-only per
ADR-0004) in the API image before the new revision takes traffic, and the
`/readyz` health gate keeps a release whose dependencies are unwired from
serving. No other service runs migrations; `migrate dev` and `db push` are
forbidden outside localhost. The worker, admin, and web must only be deployed
after the API pre-deploy + readiness succeed (deploy ordering is enforced
during provisioning, S11-08).

## Deploy evidence

Every Dockerfile declares `ARG RAILWAY_GIT_COMMIT_SHA` (Railway injects it as
a build arg for Dockerfile builds) and bakes it as `ENV AUTOTM_COMMIT_SHA`.
`/healthz` (all HTTP services) and `/readyz` (API) report `commitSha` +
`environment`, so deploy evidence identifies the exact `main` revision even
when Railway rebuilds it. `environment` prefers the Railway-injected
`RAILWAY_ENVIRONMENT_NAME`, falling back to `APP_ENV`.

## Provider-side settings

Everything Railway actually runs on is set provider-side and verified during
provisioning (S11-07/S11-08) — listed here so drift stays auditable:

1. **Service source**: each of `api`, `worker`, `admin`, `web` builds from
   this repo with the **root directory set to the repository root** (the
   Dockerfiles need the full monorepo context).
2. **Deploy contract**: the `build` and `deploy` blocks of each JSON file
   above — Dockerfile path, start command, pre-deploy command, healthcheck
   path and timeout, restart policy, sleep mode — applied per environment
   through `serviceInstanceUpdate`. These are not read from the repo
   (ADR-0044).
3. **Environments**: one project, `staging` + `production`. PR environments ([ADR-0075](../docs/adr/0075-railway-pr-backends-for-agent-native-sessions.md)) are off: ADR-0098 retired them for cost and [ADR-0108](../docs/adr/0108-small-prs-with-full-send-replace-integration-delivery.md) keeps them off. Staging
   auto-deploys `main` with **Wait for CI** (GitHub Actions must be green);
   production has **no branch autodeploy** — an operator manually deploys the
   exact staging-proven SHA (S11-12).
4. **Private networking**: `api`/`worker` reach Postgres, Redis, and MinIO
   over `*.railway.internal` hostnames; MinIO's public endpoint is only for
   anonymous media reads + signed PUTs. The MinIO console is not public. See
   [`minio.md`](minio.md) for the bucket/bootstrap/backup contract.
5. **Serverless sleep** (staging only, per sprint contract): permitted for
   `api`, `admin`, `web`; the worker and data services stay awake. All
   production services stay awake during store review. Enabled on `admin` and
   `web`, which sleep in 4–6 minutes and wake in ~2.2–2.4s. **Disabled on
   `api`** — it holds three long-lived Redis sockets (the Socket.IO adapter's
   pub/sub clients and the BullMQ queue connection), so Railway's packet-based
   idle detector never fires and the setting could not take effect. The
   declaration is `false` so it matches observed behaviour rather than
   asserting a sleep that cannot happen (ADR-0044 drift rule). Measured and
   root-caused in
   [`docs/prd/ops/evidence/issue-278-staging-applications.md`](../docs/prd/ops/evidence/issue-278-staging-applications.md).

## Environment matrix (names/references only — never values)

Secrets and generated connection strings live in Railway variables. This
matrix is the checked-in, secret-free contract; `R` = Railway reference
variable, `H` = human-supplied credential (stored only in Railway), `G` =
generated per environment.

| Variable | api | worker | admin | web | Source |
|---|---|---|---|---|---|
| `APP_ENV` | yes | yes | — | — | `staging` / `production` per environment |
| `AUTOTM_COMMIT_SHA` | baked | baked | baked | baked | image build arg (not a variable) |
| `DATABASE_URL` | yes | yes | — | — | R: `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | yes | yes | — | — | R: `${{Redis.REDIS_URL}}` |
| `MINIO_ENDPOINT` / `MINIO_PUBLIC_URL` | yes | yes | — | — | R/G: private origin / public S3 endpoint; distinct hosts in staging/production |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | yes | yes | — | — | G (S11-02) |
| `MINIO_REGION` | yes | yes | — | — | fixed `us-east-1` unless provider requires another S3 signing region |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | — | — | — | H, distinct per environment |
| `TOTP_SECRET_ENCRYPTION_KEY` | yes | — | — | — | H (32-byte base64) |
| `SMS_DRIVER` | yes | — | — | — | fixed `mock` in both environments (ADR-0039) |
| `SOCKET_IO_CORS_ORIGIN` | yes | — | — | — | explicit origin list; never `*` in production |
| `PUSH_TRANSPORT` | — | yes | — | — | `fcm` in production during the Android-first window, `fcm-apns` once Apple credentials exist (ADR-0047) |
| `FCM_*` | — | yes | — | — | H, all three required for `fcm` and `fcm-apns` (S11-05) |
| `APNS_*` | — | yes | — | — | H, all five required for `fcm-apns` only; unread under `fcm` (ADR-0047) |
| `NEXT_PUBLIC_API_URL` | — | — | yes | yes | R: API service public domain |
| `NEXT_PUBLIC_MINIO_PUBLIC_URL` | — | — | yes | yes | R/G (S11-02) |
| `SESSION_SECRET` | — | — | yes | — | G |
| `PORT` | yes | — | yes | yes | F: must match the port the image listens on; Railway injects `PORT=8080` and it overrides the Dockerfile `ENV PORT` |
| `API_BASE_URL` | — | — | yes | yes | R: http(s) API private `*.railway.internal` origin, optionally ending in `/api/v1`, with or without a trailing slash. Required for admin in production, which validates it at startup. Used for server-side admin calls and web's account deletion Server Functions. Required for web: the fallback to `NEXT_PUBLIC_API_URL` sends web's calls through the public edge, which overwrites web's `X-Real-IP`, so every web visitor shares one Sign-in Code budget (ADR-0078) |
| `ADMIN_ORIGIN` | — | — | yes | — | R: admin public origin |
| `SIGNUPS_ENABLED` | yes | — | — | — | F: `false` in staging and production until public launch |
| `CLIENT_IP_HEADER` / `CLIENT_IP_TRUSTED_HOPS` | optional | — | — | optional | F: unset on Railway, where the defaults trust the edge's `X-Real-IP` (ADR-0078); set both for another ingress. A hop count is safe only when the service cannot be reached except through those proxies |
| `API_CLIENT_IP_HEADER` | — | — | — | optional | F: the header web forwards the visitor's address in, matching the API's `CLIENT_IP_HEADER` on web's private path; unset on Railway (`x-real-ip`) |

Reviewer-era fail-closed flags (`SMS_DRIVER=test`, `OTP_TEST_MODE`,
`OTP_TEST_CODE_RESPONSE`, `PUSH_TRANSPORT=test` in production, loopback or
cross-environment data endpoints, placeholder/default secrets) are rejected
by `apps/api/src/env.schema.ts` and `apps/worker/src/env.schema.ts` at boot —
no dashboard setting can accidentally enable them.

## References

- [ADR-0039 — phased cloud-first hosting](../docs/adr/0039-phased-cloud-first-hosting.md)
- [ADR-0004 — migrations](../docs/adr/0004-migrations.md)
- [Sprint 11 — Railway deployment](../docs/prd/sprints/sprint-11-railway-deployment.md)
- [`infra/docker/`](../infra/docker/README.md)
- [ADR-0044 — Railway deploy settings live provider-side](../docs/adr/0044-railway-deploy-settings-live-provider-side.md)
- Railway docs: infrastructure as code (`https://docs.railway.com/infrastructure-as-code`)
