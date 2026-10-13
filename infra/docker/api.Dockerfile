# apps/api production image (NestJS + Prisma).
#
# Build context: repository root (the Railway service's root directory must
# stay the repo root — see railway/README.md). The API is the sole migration
# authority: Railway runs the pre-deploy command from railway/api.json
# (`pnpm --filter @auto-tm/db migrate:deploy`) in this image before the new
# revision takes traffic. Forward-only, per ADR-0004.
FROM node:22-bookworm-slim AS base
# Corepack caches the activated pnpm under $COREPACK_HOME, which defaults to
# the *invoking user's* home. The runtime stages drop to the system user
# `auto-tm`, which has no home directory, so a runtime `pnpm` (the API's
# migrate pre-deploy) would fail with EACCES trying to re-download pnpm.
# Pinning a shared, world-writable location makes the prepared pnpm reachable
# from every user in every stage.
# pnpm 12 is a native executable: corepack fetches only its launcher, which
# downloads the binary next to itself on first run. `pnpm --version` fetches it
# here, as root and before the permissions are fixed, so no later stage or user
# has to download it.
ENV COREPACK_HOME=/opt/corepack
RUN mkdir -p /opt/corepack && chmod 777 /opt/corepack \
    && corepack enable && corepack prepare pnpm@12.11.2 --activate \
    && pnpm --version \
    && chmod -R a+rX /opt/corepack
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/sms-gateway/package.json apps/sms-gateway/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
# No BuildKit cache mount here. Railway's builder requires cache mount ids of
# the form `s/<service id>-<target path>` and rejects env vars inside them, so
# a cache mount would bake a Railway service UUID into an image these
# Dockerfiles also build for the ADR-0005 air-gapped bundles. Layer caching on
# an unchanged lockfile covers the common case.
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Runtime-shared packages export dist/, so build them before the app.
# Prisma 7 loads packages/db/prisma.config.ts during generate and requires a
# datasource URL even though no connection is made. Runtime migrate deploy uses
# the real Railway DATABASE_URL.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @auto-tm/db build
RUN pnpm --filter @auto-tm/contracts build
RUN pnpm --filter @auto-tm/api build

FROM base AS runtime
# Deploy evidence: Railway injects RAILWAY_GIT_COMMIT_SHA as a build arg for
# Dockerfile builds; baking it into ENV means /healthz and /readyz identify
# the exact revision even when Railway rebuilds it. "unknown" off Railway.
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV AUTOTM_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
RUN apt-get update && apt-get install -y --no-install-recommends curl openssl postgresql-client && rm -rf /var/lib/apt/lists/*
# Root workspace files so the migration pre-deploy command can run
# `pnpm --filter @auto-tm/db migrate:deploy` inside this image.
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/packages /app/packages
# Guarded remote native fixtures reuse packaged db scripts and dependencies.
COPY --from=build /app/scripts/native-pr-seed.mjs /app/scripts/native-pr-seed.mjs
COPY --from=build /app/infra/minio/bootstrap.mjs /app/infra/minio/contract.mjs /app/packages/db/scripts/native-minio/
RUN groupadd -r auto-tm && useradd -r -g auto-tm -s /bin/false auto-tm && chown -R auto-tm:auto-tm /app
USER auto-tm
WORKDIR /app/apps/api
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:3006/healthz || exit 1
CMD ["node", "dist/src/main.js"]
