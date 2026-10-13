# `.github/workflows/`

GitHub Actions workflows. All of them run on GitHub-hosted `ubuntu-latest` runners, free for this public repository ([ADR-0073](../../docs/adr/0073-ci-gates-and-release-bundles-run-on-github-hosted-runners.md), which amends the CI/CD split in [ADR-0039](../../docs/adr/0039-phased-cloud-first-hosting.md)). The earlier self-hosted `tm-build-mac` runner is retired; no workflow uses a `self-hosted` or `tm-proxy` label, and nothing in the repository registers a runner.

## Active workflows

| Workflow | Trigger | Runner | Purpose |
|---|---|---|---|
| `ci.yml` | Push to `main` | `ubuntu-latest` | lane choice → disposable test services → install → glossary check → lane tests → db generate and migrate → MinIO buckets → lint → typecheck → `pnpm test` → `pnpm build` → service cleanup. Docs-only pushes stop after the docs checks |
| `pr-checks.yml` | Pull request to `main` | `ubuntu-latest` | lane choice → disposable test services → install → glossary check → lane tests → db generate and migrate → MinIO buckets → lint → typecheck → `pnpm test` → service cleanup. Docs-only pull requests stop after the docs checks; a new push cancels the older run |
| `bundle.yml` | Tag push `v*`, manual dispatch | `ubuntu-latest` | `make bundle TAG=<tag>` builds the service images and saves them to `images/auto-tm-<tag>.tar.gz`, uploaded as a workflow artifact (90-day retention). A manual dispatch takes an optional `tag` input, defaults to `dev-<sha>`, and publishes nothing but the artifact |

Each job has a 30-minute timeout (the bundle job 60). Each workflow sets `permissions: contents: read`.

### Lanes and cancellation

Both gate workflows avoid work that cannot change the result.

- **Cancellation.** PR Checks uses one concurrency group per pull request with `cancel-in-progress`. A new push cancels that pull request's queued or running run; other pull requests are unaffected and run in parallel. `main` has no concurrency group: every push to `main` is checked, in order.
- **Docs lane.** `scripts/ci-lane.mjs` selects docs when every changed path is Markdown (`*.md`, anywhere) or lives under `docs/`. PR Checks compares the synthetic merge commit with its base parent at `fetch-depth: 2`. It also takes the docs lane after a green previous head of the same PR when only documentation changed by hand since then, including documentation conflict resolutions in a merge from `main`; see [ADR-0091](../../docs/adr/0091-docs-lane-after-a-green-pull-request-head.md). CI compares the push with the previous `main` commit (`github.event.before`). The docs lane runs install, the glossary check, lane tests, `pnpm test:agent-docs`, and `pnpm test:glossary`, and skips test services, migrations, MinIO, lint, typecheck, workspace tests, and the build. Renames list both paths, so moving code into `docs/` takes the full lane.
- **Fail-safe.** If neither docs rule can be proved, the lane is `full`. An unreadable diff takes full; the green-previous-head rule also requires readable, unambiguous event, history and check data. Full-pipeline steps use `lane != 'docs'`. The lane rule is tested by `pnpm test:ci-lane`, which both lanes run.
- **Required check.** Branch protection requires the `pr` job. Keep that job id. Do not add a workflow-level `paths` or `paths-ignore` filter to PR Checks: a pull request whose workflow never starts leaves `pr` pending forever, and auto-merge never fires. Skip steps inside the job instead.
- **Cleanup on cancel.** The service cleanup step uses `always()`, which also runs when a newer push cancels the run.

### Toolchain and caching

Every workflow installs pnpm with `pnpm/action-setup` (version pinned to the `packageManager` field in `package.json`; keep the two equal) before Node. pnpm 12 needs `pnpm/action-setup` v6.1.0 or later, and the floating `v6` tag still points at 6.0.10, so the workflows pin `v6.1.0`. The same pnpm version is pinned in the Dockerfiles' `corepack prepare` and in `apps/mobile/eas.json`. pnpm reads its settings, the `allowBuilds` list and the dependency catalog from `pnpm-workspace.yaml`. Then Node is installed with `actions/setup-node` and `cache: pnpm`. pnpm must come first so `setup-node` can find it. The standard GitHub cache holds the pnpm store, keyed on `pnpm-lock.yaml`, so the first run after a lockfile change is cold and later runs restore the store. Docker and Compose v2 are the runner's built-ins. There is no persistent runner state to prune or repair, and a failed run leaves nothing behind once the runner is discarded.

Compare timings of two runs, step by step, with:

```bash
gh api repos/bagtyyarkovusov/auto.tm-rewrite/actions/runs/<run-id>/jobs \
  --jq '.jobs[] | {name, runner_name, steps: [.steps[] | {name, conclusion, started_at, completed_at}]}'
```

Subtract `started_at` from `completed_at` per step. The trial that led to the move measured a cold-cache hosted run at 3m33s against 2m42s self-hosted; see ADR-0073. The research that preceded it, including the retired self-hosted store layout, is in [the runner performance research](../../docs/research/github-actions-self-hosted-performance.md) and is historical.

## Disposable CI services

PR Checks and CI each start `infra/compose/docker-compose.ci.yml` through `scripts/ci-services.sh`. The Compose project name includes `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`, so re-runs get separate containers, networks, and volumes. Docker assigns random host ports bound to `127.0.0.1`; the script reads them with `docker compose port` and writes `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`, and `MINIO_PUBLIC_URL` to `$GITHUB_ENV` for later steps. The job's initial endpoint values point to unreachable port 1, so no step can reach a service before the script starts it.

`docker compose up --wait` waits for Postgres, Redis, and MinIO health checks. After `pnpm install` and Prisma client generation, `pnpm db:migrate:deploy` applies this checkout's committed migrations to the empty CI database. `pnpm minio:bootstrap` creates its media buckets before tests. The last step uses `if: always()` and `docker compose down --volumes --remove-orphans`, including when an earlier step fails. The CI Compose file uses disposable volumes, never the development Compose project's volumes or fixed ports.

All test credentials and flags are public, nonproduction placeholders written by `scripts/ci-services.sh`: the MinIO keys and region, JWT secrets, TOTP key, and report/moderation flags. The `pnpm test` step sets `NODE_ENV` and `APP_ENV` to `test`, and sets `TESTCONTAINERS_RYUK_DISABLED` because the hosted runner is discarded after the job and a fresh test worker reconnecting to the previous worker's Ryuk reaper can fail with "Failed to connect to Reaper". It includes the reviewer-flow smoke's pure helper tests; the deployed smoke remains an operator command. The CI build keeps its normal production mode. Production values never belong in CI (ADR-0005).

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
