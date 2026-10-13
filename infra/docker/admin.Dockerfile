# apps/admin production image (Next.js standalone server).
#
# Build context: repository root. next.config.ts sets output:"standalone"
# with outputFileTracingRoot at the repo root, so .next/standalone mirrors
# the monorepo layout (standalone/apps/admin/server.js) and already contains
# the traced minimal node_modules — no workspace node_modules are copied.
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
# datasource URL even though no connection is made.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @auto-tm/db build
RUN pnpm --filter @auto-tm/contracts build
RUN pnpm --filter @auto-tm/admin build

FROM base AS runtime
# Deploy evidence: baked from Railway's RAILWAY_GIT_COMMIT_SHA build arg so
# /healthz identifies the exact revision even when Railway rebuilds it.
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV AUTOTM_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
# Standalone output excludes .next/static and public by design. Copy both
# alongside the traced monorepo server so Assigned Avatars are served.
COPY --from=build /app/apps/admin/.next/standalone /app
COPY --from=build /app/apps/admin/.next/static /app/apps/admin/.next/static
COPY --from=build /app/apps/admin/public /app/apps/admin/public
RUN groupadd -r auto-tm && useradd -r -g auto-tm -s /bin/false auto-tm && chown -R auto-tm:auto-tm /app
USER auto-tm
WORKDIR /app
ENV PORT=3001 HOSTNAME=0.0.0.0
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3001/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/admin/server.js"]
