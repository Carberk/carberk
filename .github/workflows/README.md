# `.github/workflows/`

GitHub Actions workflows. All of them run on GitHub-hosted `ubuntu-latest` runners, free for this public repository ([ADR-0073](../../docs/adr/0073-ci-gates-and-release-bundles-run-on-github-hosted-runners.md), which amends the CI/CD split in [ADR-0039](../../docs/adr/0039-phased-cloud-first-hosting.md)). The earlier self-hosted `tm-build-mac` runner is retired; no workflow uses a `self-hosted` or `tm-proxy` label, and nothing in the repository registers a runner.

## Active workflows

| Workflow | Trigger | Runner | Purpose |
|---|---|---|---|
| `ci.yml` | Push to `main` | `ubuntu-latest` | The [job graph](#job-graph) below, plus a `build` job running `pnpm build`. Docs-only pushes run only the docs job. There is no aggregator: `main` has no required check |
| `pr-checks.yml` | Pull request to `main` | `ubuntu-latest` | The [job graph](#job-graph) below, ending in the required `pr` job. Docs-only pull requests run only the docs job; a new push cancels the older run |
| `bundle.yml` | Tag push `v*`, manual dispatch | `ubuntu-latest` | `make bundle TAG=<tag>` builds the service images and saves them to `images/auto-tm-<tag>.tar.gz`, uploaded as a workflow artifact (90-day retention). A manual dispatch takes an optional `tag` input, defaults to `dev-<sha>`, and publishes nothing but the artifact |

Each work job has a 30-minute timeout (the bundle job 60; `lane` and `pr` 5). Each workflow sets `permissions: contents: read`.

### Job graph

PR Checks and CI run as parallel jobs, each on its own runner:

```
lane ─┬─ docs        (docs lane only)
      ├─ static      lint, typecheck, admin verify:runtime; no services
      ├─ api         pnpm test:api: api, worker; disposable services
      ├─ db          pnpm test:db: db; its own Testcontainers, no Compose services
      ├─ frontend    pnpm test:frontend: mobile, web, admin, contracts, sms-gateway; then pnpm test:root
      └─ build       (CI only) pnpm build
                 └── pr (PR Checks only) needs every job above, if: always()
```

- **`lane`** runs `scripts/ci-lane.mjs`: PR Checks checks out at depth 2, CI fetches the previous `main` commit. Its `lane` output is `docs` or `full`. It installs nothing, so the work jobs start within seconds.
- **`docs`** runs when the lane is `docs`: install, the glossary check, the lane tests, `pnpm test:agent-docs` and `pnpm test:glossary`.
- **`static`**, **`api`**, **`db`**, **`frontend`** and (on `main`) **`build`** run when the lane is not `docs`. `static` also runs the glossary check and the lane tests. Only `api` starts the disposable services. `db` runs apart from `api` because the two suites slowed each other on one 4-core runner: on run 38353770213 the demo-inventory seed test took 76–92 s and `@auto-tm/api:test` 147–178 s together, against 58 s and 108 s on a quieter run. `frontend` runs `pnpm test:root` after the workspace tests, because the reviewer-flow smoke imports the built `@auto-tm/contracts`; `test:root` runs every `scripts/*.test.mjs` file in one concurrent `node --test`. `scripts/ci-jobs.test.mjs` fails if a workspace with a `test` script is in none of `test:api`, `test:db` and `test:frontend`, or in more than one; if a job other than `api` starts the Compose services; or if `api` or `db` sets a variable that turbo's strict env mode would strip.
- **`pr`** lists every other job in `needs` and runs with `if: always()`. It passes only when each needed job succeeded or was skipped by the lane: `docs` in the full lane, `static`, `api`, `db` and `frontend` in the docs lane. Anything else fails it: a failed, cancelled or unexpectedly skipped job, or a failed `lane` job, which skips everything after it.

`if: always()` on `pr` is load-bearing. Without it, a failed job makes GitHub skip `pr` too, because a job's default condition requires its needed jobs to succeed, and GitHub counts a skipped required check as passing. A broken pull request could then merge. `scripts/ci-jobs.test.mjs` checks that `pr` needs every other job, keeps `if: always()` and reads each needed job's result.

### Lanes and cancellation

Both gate workflows avoid work that cannot change the result.

- **Cancellation.** PR Checks uses one concurrency group per pull request with `cancel-in-progress`. A new push cancels that pull request's queued or running run; other pull requests are unaffected and run in parallel. `main` has no concurrency group: every push to `main` is checked, in order.
- **Docs lane.** `scripts/ci-lane.mjs` selects docs when every changed path is Markdown (`*.md`, anywhere) or lives under `docs/`. PR Checks compares the synthetic merge commit with its base parent at `fetch-depth: 2`. It also takes the docs lane after a green previous head of the same PR when only documentation changed by hand since then, including documentation conflict resolutions in a merge from `main`; see [ADR-0091](../../docs/adr/0091-docs-lane-after-a-green-pull-request-head.md). CI compares the push with the previous `main` commit (`github.event.before`). The docs lane runs only the `docs` job, so it skips test services, migrations, MinIO, lint, typecheck, workspace tests, and the build. Renames list both paths, so moving code into `docs/` takes the full lane.
- **Fail-safe.** If neither docs rule can be proved, the lane is `full`. An unreadable diff takes full; the green-previous-head rule also requires readable, unambiguous event, history and check data. Full-lane jobs use `needs.lane.outputs.lane != 'docs'`. The lane rule is tested by `pnpm test:ci-lane`, which both lanes run.
- **Required check.** Branch protection requires the `pr` job. Keep that job id and its `if: always()` (see the [job graph](#job-graph)). Do not add a workflow-level `paths` or `paths-ignore` filter to PR Checks: a pull request whose workflow never starts leaves `pr` pending forever, and auto-merge never fires. Skip jobs through the lane instead.
- **Cleanup on cancel.** The `api` job's service cleanup step uses `always()`, which also runs when a newer push cancels the run. A cancelled run also runs `pr`, which fails on the cancelled jobs; the newer run reports the check for the new head.

### Toolchain and caching

Every job that installs dependencies sets up pnpm with `pnpm/action-setup@v6.1.0` before Node with `actions/setup-node@v7` and `cache: pnpm`. pnpm must come first so `setup-node` can find it, and since `setup-node` v6 pnpm caching happens only when `cache: pnpm` is set. `pnpm/action-setup` has no `version:` input: it reads the version from the `packageManager` field in `package.json`, and fails if the two disagree. It is pinned to the exact tag `v6.1.0`, not the floating `v6`: in October 2026 `v6` still pointed at 6.0.10, which the pnpm 12 upgrade work (#852) found cannot install pnpm 12. The same pnpm version is pinned in the Dockerfiles' `corepack prepare` and in `apps/mobile/eas.json`; keep every pin equal to `packageManager`. pnpm reads its settings, the `allowBuilds` list and the dependency catalog from `pnpm-workspace.yaml`. Checkout is `actions/checkout@v7` and the bundle upload `actions/upload-artifact@v7`; all four run on Node 24. The standard GitHub cache holds the pnpm store, keyed on `pnpm-lock.yaml`, so the first run after a lockfile change is cold and later runs restore the store. Docker and Compose v2 are the runner's built-ins. There is no persistent runner state to prune or repair, and a failed run leaves nothing behind once the runner is discarded.

Compare timings of two runs, step by step, with:

```bash
gh api repos/bagtyyarkovusov/auto.tm-rewrite/actions/runs/<run-id>/jobs \
  --jq '.jobs[] | {name, runner_name, steps: [.steps[] | {name, conclusion, started_at, completed_at}]}'
```

Subtract `started_at` from `completed_at` per step. The trial that led to the move measured a cold-cache hosted run at 3m33s against 2m42s self-hosted; see ADR-0073. Before the job split (#851) a full-lane PR Checks run took 8–10 minutes on one runner, of which `pnpm test` took 333–472 seconds. Timings after the split are recorded on PR #855.

The turbo `test` tasks declare `outputs: []`: no workspace test writes coverage or another file worth caching. The research that preceded it, including the retired self-hosted store layout, is in [the runner performance research](../../docs/research/github-actions-self-hosted-performance.md) and is historical.

## Disposable CI services

The `api` job of PR Checks and CI starts `infra/compose/docker-compose.ci.yml` through `scripts/ci-services.sh`. The Compose project name includes `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`, so re-runs get separate containers, networks, and volumes. Docker assigns random host ports bound to `127.0.0.1`; the script reads them with `docker compose port` and writes `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`, and `MINIO_PUBLIC_URL` to `$GITHUB_ENV` for later steps. The job's initial endpoint values point to unreachable port 1, so no step can reach a service before the script starts it.

`docker compose up --wait` waits for Postgres, Redis, and MinIO health checks. After `pnpm install` and Prisma client generation, `pnpm db:migrate:deploy` applies this checkout's committed migrations to the empty CI database. `pnpm minio:bootstrap` creates its media buckets before tests. The last step uses `if: always()` and `docker compose down --volumes --remove-orphans`, including when an earlier step fails. The CI Compose file uses disposable volumes, never the development Compose project's volumes or fixed ports.

All test credentials and flags are public, nonproduction placeholders written by `scripts/ci-services.sh`: the MinIO keys and region, JWT secrets, TOTP key, and report/moderation flags. The `pnpm test:api` step and the `db` job set `NODE_ENV` and `APP_ENV` to `test`, and set `TESTCONTAINERS_RYUK_DISABLED` because the hosted runner is discarded after the job and a fresh test worker reconnecting to the previous worker's Ryuk reaper can fail with "Failed to connect to Reaper". The `db` job sets only an unreachable `DATABASE_URL`, which Prisma generate requires; each db test passes its own container's URL. The `frontend` job sets `NODE_ENV` and `APP_ENV` to `test` and has no service variables. `pnpm test:root` includes the reviewer-flow smoke's pure helper tests; the deployed smoke remains an operator command. The CI build keeps its normal production mode. Production values never belong in CI (ADR-0005).

### API spec files on per-worker databases

`apps/api` runs its spec files in parallel. `apps/api/test/globalSetup.ts` creates `<database>_t<run id>_template`, applies this checkout's committed migrations to it with `prisma migrate deploy`, and clones `<database>_t<run id>_w1` … `_w<N>` from it with `CREATE DATABASE … TEMPLATE`, one per Vitest worker. In CI the base is the migrated disposable database; the template is migrated from the same migrations rather than cloned from it, because `CREATE DATABASE … TEMPLATE` fails while another session is connected to the source, and the worker tests use that database at the same time. `apps/api/test/setup-env.ts` points each worker at its database and at Redis logical database N (`VITEST_POOL_ID`) before any module loads, so a spec that TRUNCATEs or calls an unscoped `deleteMany()` reaches only its own worker's rows. Teardown drops the template and worker databases with `DROP DATABASE … WITH (FORCE)`. Locally the same harness runs against the dev Compose stack's Postgres and Redis, and Redis database 0 stays with the dev server. `pnpm --filter @auto-tm/api test:unit` sets `AUTO_TM_TEST_DATABASES=off` and creates nothing. MinIO stays shared: a spec that wipes objects must scope the wipe to keys only it writes, as `BrandLogoCleanupRaces.e2e.spec.ts` does with its `races-` brand slugs.

### MinIO image

Compose and Testcontainers pull digest-pinned Chainguard MinIO images directly,
with no local alias. CI uses the dev variant because its container health check
needs a shell and `wget`; Testcontainers probes HTTP from the test process and
uses the minimal variant. A fresh hosted runner exercises anonymous pulls,
service readiness, bucket bootstrap, and brand-logo S3 imports. The image and
volume contract is recorded in [ADR-0074](../../docs/adr/0074-digest-pinned-chainguard-minio-images.md).

### Turbo strict env mode (load-bearing)

`turbo.json` runs in strict env mode: a variable not listed in `globalEnv` or `globalPassThroughEnv` is **stripped from task processes on any runner**. `globalEnv` also includes the value in task cache hashes; `globalPassThroughEnv` does not. Adding a new CI-required variable means changing two places together:

1. `scripts/ci-services.sh` or the workflow job `env:` (value), and
2. `globalEnv` or `globalPassThroughEnv` in `turbo.json` (name). `APP_ENV` is in `globalEnv` so its value reaches test tasks and changes their cache key.

Missing (2) was the root cause of the PR-#257 CI failure (fixed in `1a64d4e`).

## Release bundle

`bundle.yml` builds the five service images (`api`, `worker`, `admin`, `web`, `sms-gateway`) with the runner's Docker through `make bundle`, so the images are built for x86 Linux, the architecture of the TM-era servers. The Makefile runs recipes with `bash -e -o pipefail`, so a failed image build or `docker save` fails the job instead of uploading an almost empty tarball. The workflow uploads the tarball as an artifact only; it does not push to a registry or create a release. The TM-era runner question reopens at TM cutover (ADR-0073), so this workflow may move again then.

To dry-run it without a tag, once the workflow file is on `main`, run `gh workflow run bundle.yml --ref main -f tag=dev-test` and download the artifact from the run.

## Release secrets

Stored in GitHub Actions repository secrets when needed:

- `RELEASE_SIGNING_KEY` — signing release tarballs
- `ANDROID_KEYSTORE_PASSWORD` — signing phone-agent APK
- `DOCKER_REGISTRY_PUSH_TOKEN` — if we ever push to a private registry

## See also

- [ADR-0003 — Monorepo](../../docs/adr/0003-monorepo.md)
- [ADR-0005 — Hosting](../../docs/adr/0005-hosting.md)
- [ADR-0010 — Testing + observability](../../docs/adr/0010-testing-obs.md)
- [ADR-0039 — Phased cloud-first hosting](../../docs/adr/0039-phased-cloud-first-hosting.md)
- [ADR-0073 — CI gates and release bundles on GitHub-hosted runners](../../docs/adr/0073-ci-gates-and-release-bundles-run-on-github-hosted-runners.md)
- [Deployment runbook](../../docs/prd/ops/80-deployment-runbook.md)
