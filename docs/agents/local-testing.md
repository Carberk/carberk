# Local testing: iOS Simulator and sign-in

How an agent runs Carberk on the local stack, signs in to the app and to Admin, and gets each code in seconds. The [environment guide](environment.md) says what exists and what needs the founder.

Test the app on the **iOS Simulator**. The Android emulator is not used for development testing on this Mac; use it only when a ticket is Android-only or the founder asks.

## 1. Check and reuse the local baseline

Implementers, reviewers and delegate briefs use this preparation route before native proof. Coordinate the target API/worktree and process/device ownership first. Preserve an active release verification session. From your checkout, select the running local API and its actual env file explicitly:

```bash
pnpm native:ready --api-origin http://127.0.0.1:3006 --env-file /absolute/path/to/api/.env
```

This checks API/Postgres/Redis/MinIO readiness, existing fixture identities and gallery order, and nonempty photo/Ready-video objects (video sizes against the stored processing manifest). Database reads use a read-only snapshot; storage uses HEAD. It preserves Sessions, server/local drafts, videos, user-added Listings and interactions. It never starts services, migrates, seeds, repairs, requests codes or operates a device. Nonlocal and production targets refuse. The selected env file must match the running API; process env overrides it, as for the API itself. Failures identify the bounded missing/configuration step; coordinate any change with its owner instead of treating a failure as permission to reset.

A successful check establishes environment availability, **not device sign-in or the code/build origin**. For native proof, follow [native fixture sign-in](native-fixture-signin.md), first with `--reuse-only`. Confirm Cabinet identity on your owned device. Record the source SHA, API/Metro ports and ownership, the actual served bundle's API/socket/media origins (or release artifact receipt), baseline check result, fixture role/session reuse and device/runtime. A config file or database User alone cannot establish these claims. Android builds and delegate briefs also follow the [bounded build, assigned ABI, explicit origins and scheduling rules](mobile-expo.md#local-android-build-pitfalls).

### Start only missing, owned services

When the check identifies an absent service, coordinate its startup separately. Stop only processes you started. For initial data/schema setup see section 1a.

### Explicit additive rich photo scenarios

For the local ten-view Lexus review Listings, select the existing eligible seller explicitly in the DB package's local environment, with `APP_ENV` and `NODE_ENV` set to `development`/`test`, and loopback `DATABASE_URL`, `MINIO_ENDPOINT` and `MINIO_PUBLIC_URL`:

```bash
pnpm --filter @auto-tm/db rich:scenarios --target local --mode plan --owner-id <existing-seller-id>
pnpm --filter @auto-tm/db rich:scenarios --target local --mode apply --owner-id <same-id> --plan-hash <reported-hash>
pnpm --filter @auto-tm/db rich:scenarios --target local --mode check --owner-id <same-id>
```

`plan` and `check` are read-only; an absent state reports the exact proposed additions and zero writes. Apply requires the plan hash bound to the local target, owner, semantic catalog IDs and rendered version. It adds `rich-es300h-portrait` and `rich-es300h-landscape`, with ten photos each; these names reserve later synthetic-video variants and do not establish video readiness. Identical reapply makes zero writes. The report links public JSON credits retaining broad/reviewer sources and all ten new sources with adaptation notices; anonymous availability is required before new Listings become visible.

For private photo-count drafts, use the same commands with `--scenario-set private-drafts`. This explicitly adds four private Photos-step cases (0/1/3/20), each with its own AVAILABLE uploads; one/three use the coherent gallery and twenty uses labelled synthetic numbered cards. Never publish the twenty-card case. Existing drafts count toward the normal five-draft cap. Plan binds the observed existing draft inventory; concurrent changes, edited/consumed cases and occupied upload/object namespaces refuse. Publication or mutable proof needs a separately owned disposable copy: complete and clean it through normal lifecycle **before** installing the four stable cases when the owner already has one draft. Do not evict drafts, change the cap or switch accounts to obtain headroom. Opening a case may normally autosave bookkeeping/timestamps; any content change remains a modified-state refusal, not permission to reset it.

The offline pack is verified and rendered through the existing photo pipeline. Missing/corrupt objects, occupied IDs/keys and edited scenarios refuse. Failed writes retain objects and report exact created/attempted keys and scenario IDs for coordinated recovery; no automatic repair, overwrite, cleanup or reset is provided. Do not remove unrelated resources to make a refusal pass. Existing identities, Sessions, drafts, videos and inventories remain outside this command's write set. Ordinary `native:ready` continues checking the sparse baseline; run the explicit rich check separately, then establish live sign-in/build/origin/gallery evidence on the owned simulator.



The Docker stack usually runs already: `docker ps` lists `compose-postgres-1`, `compose-redis-1` and `compose-minio-1`. If not, run `pnpm compose:up`.

In a fresh worktree, create the local env files once. The templates point at localhost, and these files are gitignored:

```bash
pnpm install --frozen-lockfile
for app in api admin mobile; do cp -n apps/$app/.env.template apps/$app/.env; done
grep -E '^(DATABASE_URL|MINIO_ENDPOINT|MINIO_ACCESS_KEY|MINIO_SECRET_KEY|MINIO_REGION)=' apps/api/.env > packages/db/.env
```

The shared local database can lag behind `main`. A readiness/schema failure requires coordinated setup (section 1a), not an automatic migration or reseed.

Start the API in the background on a free port, with its own log. Several agents share this Mac, so check `lsof -nP -iTCP:<port> -sTCP:LISTEN` first; `3006` is the default. In Claude Code or Codex, use the tool's background mode instead of the trailing `&`:

```bash
PORT=3006 LISTING_VIDEO_API_ORIGIN=http://localhost:3006 pnpm --filter @auto-tm/api dev > /tmp/carberk-api-3006.log 2>&1 &
```

Use the same port in all three places. `LISTING_VIDEO_API_ORIGIN` puts that port into video URLs; with the wrong port, video plays from another agent's API. Then check it until it answers, usually within a few seconds:

```bash
curl -sf http://localhost:3006/readyz && echo ready
```

Start Admin in the background too, using the same tool background mode or trailing `&`:

```bash
pnpm --filter @auto-tm/admin dev > /tmp/carberk-admin.log 2>&1 &
```

Then check its login page until it answers:

```bash
curl -sf http://localhost:3001/login > /dev/null && echo ready
```

If port `3001` is taken, check the existing process before starting another. Stop only processes you started.

Starting the API also builds `@auto-tm/db` and contracts, which the scripts below need. The API serves the code of the worktree that started it. If a port is taken, another session's API is running: pick another port rather than stopping it.

## 1a. Seed test data

These are **explicit writes**, for initial setup of an agreed local target or a coordinated destructive reset. Ordinary preparation uses section 1 and reuses existing state. Obtain the shared stack owners' exclusion window before migrations, seeding or replacement; preserve any active release proof. There is no reset operation in `native:ready`.

`ui:fixture` replaces its Listings and deletes/recreates its fixture Users. Cascades remove their Sessions, server drafts, favourites, conversations/messages and user-added Listings, including data outside the fixed Listing IDs; it also removes video slots/generations/sources. Local drafts remain on the device but can lose their server/account references. Fixture replacement is not safe routine preparation. Coordinate any intended loss first, then run from the repository root in this order:

```bash
pnpm db:migrate:deploy                               # apply migrations main has and the database lacks
pnpm db:seed                                         # catalog and brand logos
pnpm --filter @auto-tm/db ui:fixture                 # Users, 12 Listings with real photos, favourites, conversations
pnpm --filter @auto-tm/worker video:fixture -- --write-env  # Ready portrait and landscape videos
```

`video:fixture` puts the videos on the first two Listings of seller `+99361000001`: portrait on `f1000000-0000-4000-8000-000000000100`, landscape on `…000000000101`. It makes them with the real worker processing code, so covers, 240p/360p/720p playlists and segments match production. With `--write-env`, it also sets the video tester lists in `apps/api/.env`; restart the API afterwards. Add `--force` to rebuild the videos. Rerunning `ui:fixture` removes them, so run `video:fixture` again after it.

| Fixture User | Phone | Video access |
|---|---|---|
| Seller (owns the video Listings) | `+99361000001` | upload, owner preview, viewing |
| Buyer (has favourites and conversations) | `+99361000009` | viewing |
| Other sellers | `+99361000002`, `+99361000003` | none |

This is the current sparse UI baseline: mostly one-photo Listings, one two-photo gallery and a deliberate no-photo case. `video:fixture` makes synthetic 30-second test-pattern clips; these are UI/worker checks, not representative media benchmarks. This check does not claim the future richer baseline in #1119 is installed.

Sign in as these Users instead of making new ones. A fixture User that stays signed in uses no new codes. After explicit setup, rerun section 1's readiness check.

To test a real upload rather than the fixture videos, also start the worker, which processes uploads: `pnpm --filter @auto-tm/worker dev > /tmp/carberk-worker.log 2>&1 &`. Only one worker should run against the shared stack, so check `pgrep -fl apps/worker` first and reuse a running one.

For video expiry checks, set `LISTING_VIDEO_GRANT_TTL_SECONDS=30` in `apps/api/.env`, or on the API command line, instead of editing code. It shortens playback grants from five minutes to that many seconds. It applies only when `APP_ENV` is `development` or `test`.

## 2. Get a sign-in code

For ordinary native fixture setup, follow the required [native fixture sign-in procedure](native-fixture-signin.md). It reuses an appropriate session and retrieves only the code for the exact successful request; it never prints a code or resends automatically.

Locally `SMS_DRIVER=mock` writes codes to the API's private log. For Admin or dedicated auth entry-flow tests, correlate the successful response's `requestId` (the log carries its first eight characters), destination and request time. Never select only the newest matching last four digits. Stop on `RATE_LIMITED`, missing, stale or ambiguous entries. Keep codes, credentials, tokens and raw responses out of screenshots, reports and git.

## 3. Sign in to Admin

Admin (`http://localhost:3001`) accepts only Users with role `admin`, and asks for a phone code and then an authenticator (TOTP) code.

**Local admin:** `+99365000901`. If `admin:totp` below says no such User exists (for example after a database reset), set it up once:

1. Sign in once as that phone: in the app, or with `POST /api/v1/auth/otp/request` and `POST /api/v1/auth/otp/verify`.
2. Promote it: `pnpm --filter @auto-tm/db admin:promote --phone +99365000901 --reason "local agent admin"`.
3. Wait for the `resendInSeconds` returned by the first code request before requesting another code for this phone, at least 60 seconds on the first request. Then sign in to Admin again. The role is read from the session, so a session from before the promotion stays non-admin. Admin then shows a QR code to set up the authenticator.

**Each sign-in:**

1. Open `http://localhost:3001/login`, enter the phone and send the code. If you just requested a code for this phone elsewhere, wait for that request's `resendInSeconds` first.
2. Enter the code from the API log (section 2).
3. Enter the authenticator code from the local helper:

```bash
pnpm -s --filter @auto-tm/db admin:totp --phone +99365000901
```

It prints only the 6-digit code on stdout (status goes to stderr), so `CODE=$(...)` works. It also finishes a pending QR setup, and Admin then shows 10 backup codes that you can ignore locally. The helper reads the secret from the local database with the key in `apps/api/.env`, and refuses any `DATABASE_URL` that is not on localhost. A code lasts 30 seconds; rerun it if Admin rejects one. Admin stays unlocked for 12 hours.

**Only the API?** Skip the browser. Verify a fresh phone code after promotion and take `accessToken` from the response. Use that bearer token for the following requests. Check `GET /api/v1/auth/admin/totp/status`; if `enrolled` is false, send `POST /api/v1/auth/admin/totp/enroll` with no body to create or recover the pending enrollment. Keep its secret and QR response private. Then run `admin:totp` and send `POST /api/v1/auth/admin/totp/verify` with `{"code":"<admin:totp code>"}`. Admin endpoints under `/api/v1/admin` then accept the same token. The same phone-code backoff applies to this path.

In T3 Code, drive the Admin page with the preview browser tools and close the tab when you finish.

## 4. Run the app on the iOS Simulator

Use the iPhone 17 Simulator (iOS 26.2, id `38747B85-BB39-48A2-BF0D-4DD6A5ED1D13`). In T3 Code, every launch, tap, text entry and screenshot goes through the device tools:

1. `device_list`, then `device_open` with the host `local` and that id. It returns an `agent-device` command bound to the device. If the device is held, preserve its owner and follow the contention rule in the native fixture procedure.
2. Start Metro from your own worktree as a background command, on `8081` or any free port: `pnpm --filter @auto-tm/mobile dev --port 8081`. A Metro started by another worktree serves that worktree's code. If your API is not on `3006`, set the same port in `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL` in `apps/mobile/.env` first.
3. Open the development build against your Metro: `<agent-device> open tm.auto.app --relaunch --metro-port 8081`.
4. `<agent-device> snapshot -i` lists the screen's elements with `@eN` refs. Use `press @eN` and `fill @eN "text"`, and use `device_screenshot` to look. Refs change after every screen change, so take a new snapshot before each press. If the first snapshot warns that the app was not in front, take it again.
5. Reuse and confirm the fixture session through the required [native fixture procedure](native-fixture-signin.md); start with `--reuse-only`.

The Simulator reaches the Mac's `localhost`, so the app uses the local API, socket and MinIO from `apps/mobile/.env` with no port forwarding.

For contention and cleanup use the [owned-device procedure](native-fixture-signin.md#prepare-one-owned-device), including the bound command's `close` and confirmed receipt **before** Device-panel cleanup. Preserve signed-in app data.

**When to rebuild the development build:** the Carberk Debug build is already installed on the iPhone 17 and loads JavaScript from whichever Metro it opens, so JavaScript and styling changes need no rebuild. Rebuild after a native change, such as a new native package, an Expo upgrade, or a change to app config or plugins. Use the route known to work on this Mac's Xcode: `native:metro -- --env staging --port <port>`, then `native:ios -- --udid <id> --port <port>`, as in the [mobile/Expo checks](mobile-expo.md#guarded-native-development-sessions). The build is the same for every backend. Afterwards, reopen it against your local Metro with step 3.

## 5. Finish

Stop the API, Admin and Metro processes you started, close only your owned device sessions in the [required order](native-fixture-signin.md#prepare-one-owned-device), and close your preview tabs. Leave the Docker stack running.

`next dev` rewrites `apps/admin/AGENTS.md` and Metro rewrites `apps/mobile/.expo/types/router.d.ts`. Restore them with `git checkout -- <file>` before committing, unless your change is about them.

## Staging

Staging sends no SMS either. Read its codes only from the staging API logs (`railway logs`, see the [environment guide](environment.md#railway)), matching the request id and time. `admin:totp` refuses staging, so ask the founder before signing in to staging Admin.
