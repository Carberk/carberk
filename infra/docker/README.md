# `infra/docker/`

Per-app Dockerfiles (one per deployable app). Build context is always the
**repository root** — on Railway, each service's root directory stays the
repo root and `build.dockerfilePath` points here (see `railway/*.json`).

## Files

| File | Builds image for |
|---|---|
| `api.Dockerfile` | `apps/api` (NestJS, port 3006) |
| `admin.Dockerfile` | `apps/admin` (Next.js standalone server, port 3001) |
| `web.Dockerfile` | `apps/web` (Next.js standalone server, port 3002) |
| `sms-gateway.Dockerfile` | `apps/sms-gateway` (Node service — TM era only, not deployed to Railway) |
| `worker.Dockerfile` | `apps/worker` (NestJS BullMQ consumer with a private health listener) |

Note: `apps/mobile` (Expo) and `apps/phone-agent` (Kotlin Android) do NOT have Dockerfiles — they're packaged via EAS Build and Gradle respectively.

## Conventions

- **Multi-stage**: deps + build + runtime stages
- **Slim base**: `node:22-bookworm-slim`
- **Reproducible**: `pnpm install --frozen-lockfile` from the committed lockfile; root `.dockerignore` keeps the build context clean (no `node_modules`, `.next`, `dist`, `.env`, or `.git`).
- **Native build tooling stays in the deps/build stages**: `python3`, `make`, `g++`, and `openssl` are installed before `pnpm install` so optional native packages and Prisma can build cleanly; runtime stages do not inherit that compiler toolchain.
- **Runtime-shared packages are built before app builds**: `@auto-tm/db` and `@auto-tm/contracts` export `dist/`, so every image builds those packages before building the consuming app.
- **Prisma client generation is build-time only**: `.env` files are excluded from the Docker context, so each build stage supplies a harmless local placeholder `DATABASE_URL` only for `@auto-tm/db` build/generate. Runtime migrations and database access use the service's real `DATABASE_URL`.
- **Next.js images run the standalone server** (`output: "standalone"` + `outputFileTracingRoot` at the repo root): the runtime stage copies only `.next/standalone`, `.next/static`, and `public`, then runs `node apps/<app>/server.js` with `PORT`/`HOSTNAME` env
- **Deploy evidence baked in**: every runtime stage declares `ARG RAILWAY_GIT_COMMIT_SHA` (injected by Railway for Dockerfile builds) and exports it as `ENV AUTOTM_COMMIT_SHA`, so `/healthz`/`/readyz` and worker boot logs identify the exact commit even when Railway rebuilds the revision
- **Healthchecks**: API curls `/healthz` (liveness; dependency-free by design), admin/web curl their dependency-free `/healthz` route, and the worker curls its private `/healthz` listener. Railway separately gates the worker on `/readyz`.
- **Non-root user**: every container runs as a non-root user. Railway images assign runtime ownership during `COPY --chown`, with a non-recursive ownership change for the existing `/app` directory, so builds do not walk or duplicate the dependency tree in a later ownership layer.
- **Migrations run ONLY via the API image pre-deploy command** (`pnpm --filter @auto-tm/db migrate:deploy`, see `railway/api.json`) — never at container start, never from the worker, never `migrate dev` / `db push` outside localhost (ADR-0004, ADR-0039). The API runtime image carries the root `package.json` + `pnpm-workspace.yaml` and `packages/db` (schema, `prisma.config.ts`, migrations, prisma CLI) for this.

## See also

- [ADR-0004 — Migrations](../../docs/adr/0004-migrations.md)
- [ADR-0039 — Phased cloud-first hosting](../../docs/adr/0039-phased-cloud-first-hosting.md)
- [ADR-0005 — Hosting](../../docs/adr/0005-hosting.md)
- [`railway/` — per-service config as code](../../railway/README.md)
- [Deployment runbook](../../docs/prd/ops/80-deployment-runbook.md)
