# Environment

What exists for Carberk, how to use it, and what an agent may change without asking. The [delivery workflow](coding-workflow.md) says when to use each part.

| Place | Use it for | Agents may | Ask the founder first |
|---|---|---|---|
| Local Docker stack | Daily development and manual testing | Start, stop, migrate, seed, reset its data | Deleting its volumes (`down -v`) |
| GitHub Actions CI | Proving every PR | Run and rerun checks | Changing workflows or branch protection |
| Railway staging | Real phones, testers, a last check before release | Read status, logs and metrics | Deploys, variable or setting changes, data resets |
| Railway production | Real users later | Read status | Everything else |
| iOS Simulator | Running the app and taking screenshots | Boot, install development builds, drive, screenshot | Nothing |

## Toolchain

Node `>=22.13`, pnpm `12.11.2` (from [package.json](../../package.json)). Install with `pnpm install --frozen-lockfile`. Workspace scripts are the command authority; [CONTEXT-MAP.md](../../CONTEXT-MAP.md) explains the apps and packages.

## Local development

The founder's Mac runs one shared development stack, Docker Compose project `compose`, from [docker-compose.dev.yml](../../infra/compose/docker-compose.dev.yml):

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

Copy each app's `.env.template` to `.env` and keep secrets out of git. The templates point everything at localhost:

| App | Port | Start |
|---|---|---|
| API (`apps/api`) | `3006`, base `/api/v1`, chat socket `/ws/chat` | `pnpm --filter @auto-tm/api dev` |
| Worker (`apps/worker`) | none | `pnpm --filter @auto-tm/worker dev` |
| Admin (`apps/admin`) | `3001` | `pnpm --filter @auto-tm/admin dev` |
| Web (`apps/web`) | `3002` | `pnpm --filter @auto-tm/web dev` |
| Mobile Metro (`apps/mobile`) | `8081` | `pnpm --filter @auto-tm/mobile dev` |

`pnpm dev` starts all of them. The stack is shared by every agent on this Mac. Use your own database for destructive test runs, and never run `docker compose down -v` without asking. Schema changes are committed migrations; `db push` and `migrate dev` stay on localhost.

[Local testing](local-testing.md) has the fast path: env files, the API log, sign-in codes, the local admin and its authenticator code, and the iOS Simulator steps.

## iOS Simulator

Test the app on the iOS Simulator. Android is not used for development testing on this Mac; use it only when a ticket is Android-only or the founder asks. Expo Go cannot run this app, so use a development build. The [mobile/Expo checks](mobile-expo.md) cover builds, pitfalls and required gates.

**In T3 Code**, drive devices only through the device tools, so the founder can watch in the Device panel:

1. `device_list` shows hosts and devices.
2. `device_open` with the host and device id returns an `agent-device` command bound to that device.
3. Run that command for every launch, deep link, tap, text entry and screenshot. `device_screenshot` shows the screen.

Do not use `simctl`, `adb` or `idb` for taps, text or screenshots in T3. They stay fine for builds, installs, logs, Metro and port forwards. If `open` reports `DEVICE_IN_USE`, another session holds the device: do not close or reuse it, tell the founder.

Devices on the founder's Mac:

| Device | Platform | Use |
|---|---|---|
| iPhone 17 (`38747B85-BB39-48A2-BF0D-4DD6A5ED1D13`) | iOS 26.2 Simulator | Carberk development testing; the Debug build is installed |
| `Carberk_Shots` | Android 16 emulator | Only for Android-only tickets |
| `Tayyn_Hyzmat_Test` | Android 16 emulator | Another project; do not use |

Backends from the Simulator:

- **Local stack:** the Simulator reaches the Mac's `localhost` directly. Start Metro from your worktree and open the installed build against it, as in [local testing](local-testing.md#4-run-the-app-on-the-ios-simulator).
- **Staging:** run `native:metro -- --env staging --port <port>`, then `native:ios -- --udid <simulator id> --port <port>`. These helpers refuse production. On this Mac's Xcode the `native:ios` route is the one known to work for iOS builds.

Stop the Metro sessions you started and close the devices you opened before you finish.

## CI on GitHub Actions

[PR Checks](../../.github/workflows/pr-checks.yml) runs on every PR. A lane job decides between docs-only and full checks. The full lane runs `static`, `db`, `frontend` and `api`, and `api` gets its own disposable Postgres, Redis and MinIO. The `pr` job aggregates them. [CI](../../.github/workflows/ci.yml) runs on `main`.

Branch protection on `main` requires PRs to pass the `pr` check from PR Checks. It needs no human approval, allows only squash merges with linear history, and deletes branches after merge. Admins follow the same rules. The `ci.yml` run after a merge has no required check. CI is the proof gate, so local Docker is never needed to prove a PR.

## GitHub

- **Repository:** `Carberk/carberk`. It is **public**, so never put secrets, tokens, phone numbers or private data in commits, issues, PRs or screenshots.
- **Access:** `gh` is signed in as the founder. Use it for issues, PRs and checks.
- **Issues:** the task tracker. See the [issue tracker](issue-tracker.md) guide and the [triage labels](triage-labels.md).
- **Archived work:** old campaign branches are tags named `archive/2026-11-04/<old-branch>` on GitHub. Branches that were never pushed, and uncommitted work, are local tags in the founder's main checkout.

## Railway

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

**Cost:** Railway bills memory every minute a service runs, about $10 per GB per month. Idle `auto-tm` uses about 1.5 GB. Redeploy bursts cost much more: 110 deploys between 5 and 14 October drove most of one month's bill. So do not create services, environments, sandboxes or extra deploys without asking. Planned savings: move storage from MinIO to Railway Buckets, and redeploy each staging service only when its own code changes.

## Mobile builds and stores

EAS profiles in [eas.json](../../apps/mobile/eas.json):

| Profile | Distribution | Backend |
|---|---|---|
| `staging` | internal | staging |
| `production-smoke` | internal | production |
| `production` | Play Store | production |

Store builds, submissions and Play Console changes need the founder's approval. Local development builds do not.
