FROM node:22-bookworm-slim AS base
# Corepack caches the activated pnpm under $COREPACK_HOME, which defaults to
# the *invoking user's* home. The runtime stages drop to the system user
# `auto-tm`, which has no home directory, so a runtime `pnpm` (the API's
# migrate pre-deploy) would fail with EACCES trying to re-download pnpm.
# Pinning a shared, world-writable location makes the prepared pnpm reachable
# from every user in every stage.
ENV COREPACK_HOME=/opt/corepack
RUN mkdir -p /opt/corepack && chmod 777 /opt/corepack \
    && corepack enable && corepack prepare pnpm@9.12.0 --activate \
    && chmod -R a+rX /opt/corepack
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY patches ./patches
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
RUN pnpm --filter @auto-tm/sms-gateway build

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/sms-gateway/dist /app/apps/sms-gateway/dist
COPY --from=build /app/apps/sms-gateway/package.json /app/apps/sms-gateway/package.json
RUN groupadd -r auto-tm && useradd -r -g auto-tm -s /bin/false auto-tm && chown -R auto-tm:auto-tm /app
USER auto-tm
WORKDIR /app/apps/sms-gateway
EXPOSE 3090
CMD ["node", "dist/server.js"]
