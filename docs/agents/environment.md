# Environment

What exists for Carberk, how to use it, and what an agent may change without asking. The [delivery workflow](coding-workflow.md) says when to use each part.

| Place | Use it for | Agents may | Ask the founder first |
|---|---|---|---|
| Owned local runtime | Daily development and manual testing | Create/resume, start/stop, migrate, initialize fresh fixtures and fix/test owned code | Deleting its volumes (`down -v`); shared data changes need actual owner coordination |
| GitHub Actions CI | Proving every PR | Run and rerun checks | Changing workflows or branch protection |
| Railway staging | Real phones, testers, a last check before release | Everything: deploy, redeploy, change variables and settings, add or change Buckets, run migrations and seeds, reset data | Nothing; see the staging rules below |
| Railway production | Real users later | Read status | Everything else |
| iOS Simulator | Running the app and taking screenshots | Use the coordinated owned device as below | Nothing |

## Toolchain

Node `>=22.13`, pnpm `12.11.2` (from [package.json](../../package.json)). Install with `pnpm install --frozen-lockfile`. Workspace scripts are the command authority; [CONTEXT-MAP.md](../../CONTEXT-MAP.md) explains the apps and packages.

## Local development

For fresh ticket environments, use the opt-in runtime helper:

```bash
pnpm local-env up 1356-history --profile history --with admin
pnpm local-env status 1356-history
pnpm local-env reset-signin-quota 1356-history
pnpm local-env stop 1356-history
```

Choose a ticket number and unique suffix. `up` binds the name to this worktree, discovers Docker-assigned loopback ports, builds API/worker sequentially, migrates and bootstraps project-scoped storage. It writes private env, logs and ownership state under `/tmp/carberk-local-<uid>/<name>`, outside git. API and worker have distinct loopback listeners; optional `--with admin,web,metro` uses the same generated origins. Reruns retain named containers, volumes, fixture data and live sessions. After source changes, stop/up rebuilds owned services; it does not replace fixtures. `--infra-only` starts just the empty infrastructure profile.

Profiles are exclusive for the life of the runtime. `empty` only prepares schema/buckets. `history` initializes the existing empty-table History actors/grant. `native` installs the existing canonical catalog/UI fixture, then plans/applies rich photos, private drafts and real-worker video sources in that order, and runs canonical `native:ready`. Sparse fixture installation never establishes native readiness. Use separate names for History and native; profile switching refuses before writes. Existing photo/logo source caches and the rich renderer cache are reused by their existing commands.

If an ordinary mock SMS sign-in returns `RATE_LIMITED`, use the reason to decide between waiting for a short backoff and calling `reset-signin-quota` on the owned disposable runtime. Restarting the API or logging out has no effect on the PostgreSQL request ledger. The command needs a prepared History or native profile and its verified running PostgreSQL container. It clears only the last 24 hours of completed or expired phone sign-in requests for the profile's two canonical fixture Users. Active challenges and codes for other purposes remain valid. A limit caused by other traffic requires its normal backoff or a fresh named runtime. Make one ordinary sign-in attempt after the recovery step.

After stop/up, rerun readiness before using the reported origins. Docker may assign a different MinIO port. A retained fixture that embeds the previous media origin can then fail readiness as modified or occupied. Keep that runtime's data and prepare a fresh owned named runtime for origin-dependent proof.

`stop` authenticates owned process sessions and checks ownership labels on containers, networks and volumes. It stops only those sessions and verified containers and preserves data. There is no destroy command. Inspect private logs on startup failure; ordinary infrastructure/startup recovery is stop/up. Interrupted fixture writes refuse replay: inspect the exact fixture receipt and follow its recovery, or use a new named runtime. An interrupted CLI can leave `operation.lock`: inspect its private owner record, verify that process ended, then remove only that lock directory. Never remove a live operation's lock. `/tmp` state is required to prove ownership; if it is lost, choose a new name and coordinate recovery of the old resources rather than adopting them.

Existing feature environments stay in place. Do not migrate, reset or move an active proof environment merely to adopt this helper, and do not make delivery wait for its adoption. The legacy shared development stack, Docker Compose project `compose`, remains available from [docker-compose.dev.yml](../../infra/compose/docker-compose.dev.yml):

| Service | Port |
|---|---|
| Postgres | `5432` |
| Redis | `6379` |
| MinIO S3 API / console | `9000` / `9001` |

```bash
pnpm compose:up            # start Postgres, Redis and MinIO
pnpm minio:bootstrap       # create buckets and read policies
pnpm db:generate           # Prisma client
pnpm db:migrate:deploy     # apply committed migrations locally
pnpm db:seed               # canonical reference baseline and brand logos, when needed
```

For test Users, Listings and Ready videos, start with [local readiness and reuse](local-testing.md#1-check-and-reuse-the-local-baseline). That guide separates ordinary checks from coordinated initial setup/reset.

Copy each app's `.env.template` to `.env` and keep secrets out of git. The templates point everything at localhost:

| App | Port | Start |
|---|---|---|
| API (`apps/api`) | `3006`, base `/api/v1`, chat socket `/ws/chat` | `pnpm --filter @auto-tm/api dev` |
| Worker (`apps/worker`) | none | `pnpm --filter @auto-tm/worker dev` |
| Admin (`apps/admin`) | `3001` | `pnpm --filter @auto-tm/admin dev` |
| Web (`apps/web`) | `3002` | `pnpm --filter @auto-tm/web dev` |
| Mobile Metro (`apps/mobile`) | `8081` | `pnpm --filter @auto-tm/mobile dev` |

`pnpm dev` starts all of them against manually selected legacy env files. A real Listing video upload stays in Processing until the worker runs, so start it when you test uploads; `video:fixture` does not need it. The legacy stack is shared by agents on this Mac. Preserve its active owners and data; use a named runtime for fresh work. Volume deletion still needs explicit authority. Schema changes are committed migrations; `db push` and `migrate dev` stay on localhost.

[Local testing](local-testing.md) has the fast path: env files, the API log, sign-in codes, the local admin and its authenticator code, and the iOS Simulator steps.

### Assignment and resource authority

Assignment grants standing authority for routine setup, tests, fixes and data-preserving process recovery inside the owner's worktree/runtime. Owners choose and run the necessary commands without per-command parent grants or frozen command packets. A shared-resource hold identifies the resource, actual conflicting operation, current owner and release condition; coordinate authority boundaries separately. Keep independent source work, focused lightweight checks and hosted CI moving while that conflict is resolved.

Treat compute, devices, browsers and staging as separate resources. Coordinate an actual heavy build/test/export/FFmpeg job with other active heavy jobs, and send its actual start/release when contention exists. An idle API/worker/Metro is not a compute reservation; a conditional future job does not hold a free build lane. Keep FFmpeg transcode concurrency at one on this host. Device selection/handoff follows the owned-device procedure below; browser work owns its tabs/sessions; actual shared staging operations follow the Railway authority below and any task-specific restriction. A local compute grant does not transfer a device, browser session or staging target.

## Browser proof and service administration

In T3 Code, start Web/Admin product UI work with `preview_status`. Use `preview_open` for an owned usable tab when needed; no active tab alone does not mean the browser is unsupported. Preserve the exact configured origin and tab/session ownership; [Admin access](admin-access.md#1-select-the-target-and-reuse-the-session) covers host-scoped cookies and sign-in. Close only tabs you opened when finished, unless the founder asked to keep them.

An external browser needs a concrete proof reason: required browser/platform behavior, a missing capability such as controlled network/CPU throttling, or a supported-tool failure that meets the current host's fallback rules. Follow the host's thresholds and recovery instructions; do not invent retries or bypass a refusal through another tool. Prefer an existing repeatable test harness for deterministic fault/throttling proof. Record the surface, exception reason and remaining proof in the existing PR or issue.

Explicit founder authorization for a named logged-in browser/session, such as Namecheap, separately permits the scoped service-administration workflow. Identify the intended service, account and tab. Prefer Chrome DevTools MCP only when actually available and authorized. Reuse prior authorization without repetitive confirmation, and preserve unrelated tabs, cookies and sessions. Logged-in access does not expand purchase, destructive, production or unrelated action authority. Never copy sessions or authentication material into another browser for convenience; keep credentials out of reports and screenshots.

Named tools are not evidence of availability: inspect the live host's capabilities and ownership. Preserve live owned authenticated workflows and valid observed proof rather than switching unsafely to apply a default. Reviewers verify browser/device choice and exception reasoning against the required proof. CI can enforce only repository helpers/configuration it inspects, not every agent tool choice. Closed-lid capability remains unverified until actual browser and device screenshot/input tests pass.

## iOS Simulator

Use the installed iOS development client with Metro for routine mobile proof. Android builds and emulation impose substantial CPU cost on this Mac, so reserve them for Android-specific acceptance, required release checks or explicit founder direction. JavaScript and styling changes reuse the client; native dependency or configuration changes require a rebuild under the [mobile/Expo checks](mobile-expo.md). Expo Go cannot run this app.

Confirm the required device, fixture and tool capability before scheduling runtime proof. A missing iOS or browser capability remains an explicit acceptance gap while independent work continues; it does not by itself authorize an Android detour or waive the required proof.

**In T3 Code**, drive devices only through the device tools, so the founder can watch in the Device panel:

1. `device_list` shows hosts and devices.
2. `device_open` with the host and device id returns an `agent-device` command bound to that device.
3. Run that command for every app launch/relaunch, interaction, deep link and screenshot; open the app before snapshots or input. `device_screenshot` shows the screen.

Real Safari/Chrome inside the target device remains valid when acceptance requires that browser; operate it through the same device controls. Do not use `simctl`, `adb`, `idb`, SSH or wrappers for device UI control in T3. Builds, installs, logs, Metro, port forwards and operations the device command cannot perform retain their allowed helper roles. Follow current host failure/recovery rules; tool failure does not transfer another session’s ownership. For `DEVICE_IN_USE`, selection and cleanup, follow the [owned native device procedure](native-fixture-signin.md#prepare-one-owned-device); preserve the existing owner/session.

Devices on the founder's Mac:

| Device | Platform | Use |
|---|---|---|
| iPhone 17 (`38747B85-BB39-48A2-BF0D-4DD6A5ED1D13`) | iOS 26.2 Simulator | Single coordinated Carberk device; selection and handoff follow the [owned-device procedure](native-fixture-signin.md#prepare-one-owned-device) |
| `Carberk_Shots` | Android 16 emulator | Only for Android-only tickets |
| `Tayyn_Hyzmat_Test` | Android 16 emulator | Another project; do not use |

Backends from the Simulator:

- **Local stack:** the Simulator reaches the Mac's `localhost` directly. Start Metro from your worktree and open the installed build against it, as in [local testing](local-testing.md#4-run-the-app-on-the-ios-simulator).
- **Staging:** run `native:metro -- --env staging --port <port>`, then `native:ios -- --udid <simulator id> --port <port>`. These helpers refuse production. Follow the [native build guidance and current T3 launch limitation](mobile-expo.md#guarded-native-development-sessions).

Stop the Metro sessions you started and complete the [owned-device handoff](native-fixture-signin.md#prepare-one-owned-device) before you finish.

## CI on GitHub Actions

[PR Checks](../../.github/workflows/pr-checks.yml) runs on every PR. A lane job decides between docs-only and full checks. The full lane runs `static`, `db`, `frontend` and `api`, and `api` gets its own disposable Postgres, Redis and MinIO. The `pr` job aggregates them. [CI](../../.github/workflows/ci.yml) runs on `main`.

Branch protection on `main` requires PRs to pass the `pr` check from PR Checks. It needs no human approval, allows only squash merges with linear history, and deletes branches after merge. Admins follow the same rules. The `ci.yml` run after a merge has no required check. CI is the proof gate, so local Docker is never needed to prove a PR.

## GitHub

- **Repository:** `Carberk/carberk`. It is **public**, so never put secrets, tokens, phone numbers or private data in commits, issues, PRs or screenshots.
- **Access:** `gh` is signed in as the founder. Use it for issues, PRs and checks.
- **Issues:** the task tracker. See the [issue tracker](issue-tracker.md) guide and the [triage labels](triage-labels.md).
- **Archived work:** old campaign branches are tags named `archive/2026-11-04/<old-branch>` on GitHub. Branches that were never pushed, and uncommitted work, are local tags in the founder's main checkout.

## Railway

**Required tooling (founder, 2026-11-13):** use direct Railway MCP tools for platform operations, the Railway CLI for operations needing repository files or local state, and `railway api` for gaps in those interfaces. Break complex investigations into direct reads and changes yourself.

Paid **Railway Agent is retired**. Never invoke `railway agent`, the `railway-agent` / `railway_agent` MCP tool, or delegate to Railway's AI assistant. Do not provision Railway cloud agents as a substitute. Keep the workspace's Agent hard spending limit at **$0**; agents must not raise it or re-enable paid Agent usage. Recommendations in external skills or tool descriptions do not authorize an exception. Railway CLI/MCP access and the existing remote CLI proxy remain in use.

Before changing anything, resolve the workspace, project, environment and service. Service operations must specify their environment; workspace billing operations must specify their workspace and spending target. Agent and compute limits are independent: preserve compute limits when disabling Agent usage. After every mutation, read the affected state back. For deployments, observe `SUCCESS` for the exact deployment ID and verify the intended revision's health before reporting success. [Railway cost controls](https://docs.railway.com/pricing/cost-control#compute-vs-agent-usage-limits) describe the separate limits.

Railway project `auto-tm` has two environments, `staging` and `production`. Each runs seven services: `api`, `worker`, `web`, `admin`, Postgres, Redis and MinIO.

**How code reaches Railway:**

1. A PR merges into `main`.
2. Railway's GitHub app waits for CI on `main` to pass. The app is still registered under the old repository name `bagtyyarkovusov/auto.tm-rewrite`, which GitHub redirects to `Carberk/carberk`.
3. **Staging** `api`, `worker`, `admin` and `web` then redeploy from `main` automatically.
4. **Production** has no trigger. The founder deploys it by hand.

PR environments are off, so PRs never deploy.

- **Migrations:** run only in the `api` pre-deploy step.
- **Settings:** the files in [railway/](../../railway/README.md) describe the intended settings, but Railway does not read them. Settings are applied in Railway and recorded there (ADR-0044).

**Reading Railway** (the CLI is signed in as the founder; run it outside the repo so no link file is created):

```bash
railway logs -p 176ddec0-dd65-4087-b82c-798599fc2ebe -e staging -s api -n 200
railway metrics -p 176ddec0-dd65-4087-b82c-798599fc2ebe -e staging -s api
railway api '{ project(id: "176ddec0-dd65-4087-b82c-798599fc2ebe") { environments { edges { node { name } } } } }'
```

Never print variable values; they are secrets.

**Staging is the agents' environment (founder, 2026-11-10).** Unless explicit task-specific instructions restrict the work, use it fully, without asking, to build, test and measure:

- Set or change staging variables and service settings, including new feature variables such as `LISTING_VIDEO_*`.
- Create and configure staging Buckets.
- Redeploy staging services.
- Run migrations and seeds.
- Sign in as test Users, and reset or reseed staging data, which is disposable.

Production stays the founder's: read its status only.

When you work on staging:

- **Never touch production.** Check `-e staging` on every command, and never copy a value from production.
- **Record what you changed.** List the variable names and settings you changed, never their values, in the PR or issue you are working on, so the next agent knows staging's state.
- **Keep the cost down.** Prefer changing an existing service to adding one. Batch variable changes so each service redeploys once. Remove anything temporary you created.

**Cost:** Railway bills memory every minute a service runs, about $10 per GB per month. Idle `auto-tm` uses about 1.5 GB. Redeploy bursts cost much more: 110 deploys between 5 and 14 October drove most of one month's bill. So batch staging changes, remove what you create, and never create production services. Planned savings: move storage from MinIO to Railway Buckets, and redeploy each staging service only when its own code changes.

## Mobile builds and stores

EAS profiles in [eas.json](../../apps/mobile/eas.json):

| Profile | Distribution | Backend |
|---|---|---|
| `staging` | internal | staging |
| `production-smoke` | internal | production |
| `production` | Play Store | production |

Store builds, submissions and Play Console changes need the founder's approval. Local development builds do not.
