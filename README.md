# Carberk

A mobile-first vehicle marketplace for Turkmenistan, with Russian, Turkmen, and English interfaces. Staging and production use the cloud-first Railway topology in [ADR-0039](docs/adr/0039-phased-cloud-first-hosting.md). The fully in-TM deployment remains a later phase.

## Find the right area

Start with [AGENTS.md](AGENTS.md) for coding instructions, [CONTEXT-MAP.md](CONTEXT-MAP.md) for ownership and source entry points, or the [roadmap](docs/prd/03-roadmap.md) for product delivery scope. The [glossary](docs/domain/GLOSSARY.md) defines project terms; the [ADR index](docs/adr/README.md) records decisions and supersession.

| Workspace | Responsibility |
|---|---|
| `apps/mobile` | Expo Android/iOS marketplace client |
| `apps/api` | NestJS API, business use-cases, authenticated chat sockets |
| `apps/admin` | Staff moderation, report review, audit UI |
| `apps/web` | Public landing, legal, and trust pages; inspect routes for shipped scope |
| `apps/worker` | Queued push delivery, sign-in email, account purge |
| `apps/sms-gateway`, `apps/phone-agent` | Scaffolds for future physical-phone SMS delivery |
| `packages/db` | Schema, migrations, client boundary, seed data |
| `packages/contracts` | Shared schemas and generated OpenAPI JSON |
| `packages/ui` | Shared tokens and browser components |
| `packages/tsconfig`, `packages/eslint-config` | Workspace compiler/lint configuration |
| `infra`, `railway` | Local infrastructure, container images, deployment configuration |

## Local development

Use the Node/pnpm versions declared in [package.json](package.json). Install with `pnpm install --frozen-lockfile`. Configure each service from its checked-in `.env.template`; keep local credentials untracked. Database package commands also need a local `DATABASE_URL`.

Start local data services with `pnpm compose:up`, generate the client with `pnpm db:generate`, and apply committed migrations to the local database with `pnpm db:migrate:deploy`. Seed local reference data when needed with `pnpm db:seed`. These commands are setup steps, not permission to mutate a deployed database.

`pnpm dev` starts workspace development processes after their dependencies and environment are ready. Mobile needs the [development-build setup and verification](docs/agents/mobile-expo.md); Expo Go cannot run the complete app.

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Migration and some integration tests use Docker/Testcontainers; other API integration suites use `DATABASE_URL` and clear fixture tables. Point test runs at a dedicated disposable database and Redis instance, not a shared development database. Package build steps need the configured database URL even when only generating the client. Workspace scripts are the command authority.

## Deployment and operations

Use the [deployment runbook](docs/prd/ops/80-deployment-runbook.md) and the effective hosting decision. The API pre-deploy command owns deployed schema migrations. Do not infer current hosting from the original air-gap charter.

Use the [portable coding workflow](docs/agents/coding-workflow.md) for bounded integration delivery and recovery.

## License

UNLICENSED. Proprietary.
