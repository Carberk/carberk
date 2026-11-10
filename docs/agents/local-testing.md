# Local testing: iOS Simulator and sign-in

How an agent runs Carberk on the local stack, signs in to the app and to Admin, and gets each code in seconds. The [environment guide](environment.md) says what exists and what needs the founder.

Test the app on the **iOS Simulator**. The Android emulator is not used for development testing on this Mac; use it only when a ticket is Android-only or the founder asks.

## 1. Start the backend and Admin

The Docker stack usually runs already: `docker ps` lists `compose-postgres-1`, `compose-redis-1` and `compose-minio-1`. If not, run `pnpm compose:up`.

In a fresh worktree, create the local env files once. The templates point at localhost, and these files are gitignored:

```bash
pnpm install --frozen-lockfile
for app in api admin mobile; do cp -n apps/$app/.env.template apps/$app/.env; done
grep -E '^(DATABASE_URL|MINIO_ENDPOINT|MINIO_ACCESS_KEY|MINIO_SECRET_KEY|MINIO_REGION)=' apps/api/.env > packages/db/.env
```

The shared local database can lag behind `main`. Bring it up to date and seed it before testing (section 1a).

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

Run these from the repository root. Each one is safe to repeat, and the local data is disposable:

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

Sign in as these Users instead of making new ones. A fixture User that stays signed in uses no new codes.

To test a real upload rather than the fixture videos, also start the worker, which processes uploads: `pnpm --filter @auto-tm/worker dev > /tmp/carberk-worker.log 2>&1 &`. Only one worker should run against the shared stack, so check `pgrep -fl apps/worker` first and reuse a running one.

For video expiry checks, set `LISTING_VIDEO_GRANT_TTL_SECONDS=30` in `apps/api/.env`, or on the API command line, instead of editing code. It shortens playback grants from five minutes to that many seconds. It applies only when `APP_ENV` is `development` or `test`.

## 2. Get a sign-in code

Locally `SMS_DRIVER=mock` sends no SMS. The API writes each code to its log:

```text
[mock] OTP for ***0901 (req 87ad54b7): 362694
```

Read the newest code for a phone by its last four digits:

```bash
grep -o '\[mock\] OTP for \*\*\*0901 (req [0-9a-f]*): [0-9]*' /tmp/carberk-api-3006.log | tail -1 | grep -o '[0-9]*$'
```

`req` is the first eight characters of the `requestId` that `POST /api/v1/auth/otp/request` returns, so a script can match its own request.

The code limits are fixed in the API (`SIGN_IN_CODE_RATE_POLICY`), and the `RATE_LIMIT_OTP_*` env variables do not change them:

- **Per phone:** 5 codes a day. The wait between codes doubles each time: 60, 120, 240, then 480 seconds (`resendInSeconds`).
- **Per IP:** 10 codes an hour. Every local request comes from the same IP, so all agents on this Mac share those 10.

So sign in as a fixture User (section 1a) or a new made-up number, and stay signed in instead of signing in again. Error replies carry a `requestId` too, so check for `RATE_LIMITED` before reading a code. A refused request answers `RATE_LIMITED` with `details.reason` (`destination_limit`, `ip_limit` or `backoff`). For `ip_limit`, wait for the hour to pass.

Use made-up local numbers in the form `+9936500XXXX`. The first sign-in creates the User. Codes, tokens and phone numbers never go into commits, PRs or screenshots.

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

1. `device_list`, then `device_open` with the host `local` and that id. It returns an `agent-device` command bound to the device. If the iPhone 17 is held by another session, use a spare Simulator instead (below).
2. Start Metro from your own worktree as a background command, on `8081` or any free port: `pnpm --filter @auto-tm/mobile dev --port 8081`. A Metro started by another worktree serves that worktree's code. If your API is not on `3006`, set the same port in `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL` in `apps/mobile/.env` first.
3. Open the development build against your Metro: `<agent-device> open tm.auto.app --relaunch --metro-port 8081`.
4. `<agent-device> snapshot -i` lists the screen's elements with `@eN` refs. Use `press @eN` and `fill @eN "text"`, and use `device_screenshot` to look. Refs change after every screen change, so take a new snapshot before each press. If the first snapshot warns that the app was not in front, take it again.
5. To sign in, go to the **Account** tab and press **Sign in, By phone or email**. The phone field already shows `+993`, so `fill` it with the eight digits only (`65000902`), then press **Get code**. Read the code from the API log (section 2). The code screen has the keyboard focused, so `<agent-device> type <code>` enters it, and the app signs in on the sixth digit.

The Simulator reaches the Mac's `localhost`, so the app uses the local API, socket and MinIO from `apps/mobile/.env` with no port forwarding.

If `device_open` or `open` fails with `DEVICE_IN_USE`, another session holds the Simulator. Do not wait for it, and do not close or reuse that session. Get your own Simulator:

```bash
pnpm sim:spare   # prints "<name> <udid>"
```

It picks a shut-down Simulator that already has the Carberk build, preferring ones named `Carberk …`. If there is none, it creates `Carberk Agent N` from the iPhone 17 and installs the build copied from a Simulator that has it. Then `device_list` and `device_open` with host `local` and that udid, and continue from step 2. It never touches a booted Simulator, because a session may hold it.

If a session from a finished or failed thread still holds a Simulator, tell the founder so they can close it in the T3 Device panel. Free your own when you finish: `device_close` ends your session so the next agent can open the Simulator.

**When to rebuild the development build:** the Carberk Debug build is already installed on the iPhone 17 and loads JavaScript from whichever Metro it opens, so JavaScript and styling changes need no rebuild. Rebuild after a native change, such as a new native package, an Expo upgrade, or a change to app config or plugins. Use the route known to work on this Mac's Xcode: `native:metro -- --env staging --port <port>`, then `native:ios -- --udid <id> --port <port>`, as in the [mobile/Expo checks](mobile-expo.md#guarded-native-development-sessions). The build is the same for every backend. Afterwards, reopen it against your local Metro with step 3.

## 5. Finish

Stop the API, Admin and Metro processes you started, close the devices you opened with `device_close`, and close your preview tabs. Leave the Docker stack running.

`next dev` rewrites `apps/admin/AGENTS.md` and Metro rewrites `apps/mobile/.expo/types/router.d.ts`. Restore them with `git checkout -- <file>` before committing, unless your change is about them.

## Staging

Staging sends no SMS either. Read its codes only from the staging API logs (`railway logs`, see the [environment guide](environment.md#railway)), matching the request id and time. `admin:totp` refuses staging, so ask the founder before signing in to staging Admin.
