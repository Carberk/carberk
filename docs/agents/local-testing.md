# Local testing: iOS Simulator and sign-in

How an agent runs Carberk on the local stack, signs in to the app and to Admin, and gets each code in seconds. The [environment guide](environment.md) says what exists and what needs the founder.

Test the app on the **iOS Simulator**. The Android emulator is not used for development testing on this Mac; use it only when a ticket is Android-only or the founder asks.

## 1. Start the backend

The Docker stack usually runs already: `docker ps` lists `compose-postgres-1`, `compose-redis-1` and `compose-minio-1`. If not, run `pnpm compose:up`.

In a fresh worktree, create the local env files once. The templates point at localhost, and these files are gitignored:

```bash
pnpm install --frozen-lockfile
for app in api admin mobile; do cp -n apps/$app/.env.template apps/$app/.env; done
grep '^DATABASE_URL=' apps/api/.env > packages/db/.env
```

Start the API as a background command, with its log in `/tmp/carberk-api.log` and higher local code limits. All local requests share one IP, so the default 10 codes an hour run out fast:

```bash
RATE_LIMIT_OTP_PHONE_DAILY=100 RATE_LIMIT_OTP_IP_HOURLY=100 \
  pnpm --filter @auto-tm/api dev > /tmp/carberk-api.log 2>&1
curl -sf http://localhost:3006/readyz && echo ready
```

Starting the API also builds `@auto-tm/db` and contracts, which the scripts below need. The API serves the code of the worktree that started it. If port `3006` is already taken, another session's API is running. Read its log in `/tmp/carberk-api.log` if it uses this convention, and ask before stopping it.

## 2. Get a sign-in code

Locally `SMS_DRIVER=mock` sends no SMS. The API writes each code to its log:

```text
[mock] OTP for ***0901 (req 87ad54b7): 362694
```

Read the newest code for a phone by its last four digits:

```bash
grep -o '\[mock\] OTP for \*\*\*0901 (req [0-9a-f]*): [0-9]*' /tmp/carberk-api.log | tail -1 | grep -o '[0-9]*$'
```

`req` is the first eight characters of the `requestId` that `POST /api/v1/auth/otp/request` returns, so a script can match its own request. The same phone gets a new code only after 60 seconds (`resendInSeconds`).

Use made-up local numbers in the form `+9936500XXXX`. The first sign-in creates the User. Codes, tokens and phone numbers never go into commits, PRs or screenshots.

## 3. Sign in to Admin

Admin (`http://localhost:3001`) accepts only Users with role `admin`, and asks for a phone code and then an authenticator (TOTP) code.

**Local admin:** `+99365000901`. If `admin:totp` below says no such User exists (for example after a database reset), set it up once:

1. Sign in once as that phone: in the app, or with `POST /api/v1/auth/otp/request` and `POST /api/v1/auth/otp/verify`.
2. Promote it: `pnpm --filter @auto-tm/db admin:promote --phone +99365000901 --reason "local agent admin"`.
3. Sign in to Admin again. The role is read from the session, so a session from before the promotion stays non-admin. Admin then shows a QR code to set up the authenticator.

**Each sign-in:**

1. Open `http://localhost:3001/login`, enter the phone and send the code.
2. Enter the code from the API log (section 2).
3. Enter the authenticator code from the local helper:

```bash
pnpm -s --filter @auto-tm/db admin:totp --phone +99365000901
```

It prints only the 6-digit code on stdout (status goes to stderr), so `CODE=$(...)` works. It also finishes a pending QR setup, and Admin then shows 10 backup codes that you can ignore locally. The helper reads the secret from the local database with the key in `apps/api/.env`, and refuses any `DATABASE_URL` that is not on localhost. A code lasts 30 seconds; rerun it if Admin rejects one. Admin stays unlocked for 12 hours.

**Only the API?** Skip the browser. Verify the phone code, take `accessToken` from the response, then send `POST /api/v1/auth/admin/totp/verify` with `{"code":"<admin:totp code>"}` and that bearer token. Admin endpoints under `/api/v1/admin` then accept the same token.

In T3 Code, drive the Admin page with the preview browser tools and close the tab when you finish.

## 4. Run the app on the iOS Simulator

Use the iPhone 17 Simulator (iOS 26.2, id `38747B85-BB39-48A2-BF0D-4DD6A5ED1D13`). In T3 Code, every launch, tap, text entry and screenshot goes through the device tools:

1. `device_list`, then `device_open` with the host `local` and that id. It returns an `agent-device` command bound to the device.
2. Start Metro from your own worktree as a background command, on `8081` or any free port: `pnpm --filter @auto-tm/mobile dev --port 8081`. A Metro started by another worktree serves that worktree's code.
3. Open the development build against your Metro: `<agent-device> open tm.auto.app --relaunch --metro-port 8081`.
4. `<agent-device> snapshot -i` lists the screen's elements with `@eN` refs. Use `press @eN` and `fill @eN "text"`, and use `device_screenshot` to look. Refs change after every screen change, so take a new snapshot before each press. If the first snapshot warns that the app was not in front, take it again.
5. To sign in, go to the **Account** tab and press **Sign in, By phone or email**. The phone field already shows `+993`, so `fill` it with the eight digits only (`65000902`), then press **Get code**. Read the code from the API log (section 2). The code screen has the keyboard focused, so `<agent-device> type <code>` enters it, and the app signs in on the sixth digit.

The Simulator reaches the Mac's `localhost`, so the app uses the local API, socket and MinIO from `apps/mobile/.env` with no port forwarding.

If `open` fails with `DEVICE_IN_USE`, another session holds the Simulator. Do not close or reuse that session; tell the founder. Free it yourself when you finish: `device_close` ends your session so the next agent can open the Simulator.

**When to rebuild the development build:** the Carberk Debug build is already installed on the iPhone 17 and loads JavaScript from whichever Metro it opens, so JavaScript and styling changes need no rebuild. Rebuild after a native change, such as a new native package, an Expo upgrade, or a change to app config or plugins. Use the route known to work on this Mac's Xcode: `native:metro -- --env staging --port <port>`, then `native:ios -- --udid <id> --port <port>`, as in the [mobile/Expo checks](mobile-expo.md#guarded-native-development-sessions). The build is the same for every backend. Afterwards, reopen it against your local Metro with step 3.

## 5. Finish

Stop the API, Admin and Metro processes you started, close the devices you opened with `device_close`, and close your preview tabs. Leave the Docker stack running.

`next dev` rewrites `apps/admin/AGENTS.md` and Metro rewrites `apps/mobile/.expo/types/router.d.ts`. Restore them with `git checkout -- <file>` before committing, unless your change is about them.

## Staging

Staging sends no SMS either. Read its codes only from the staging API logs (`railway logs`, see the [environment guide](environment.md#railway)), matching the request id and time. `admin:totp` refuses staging, so ask the founder before signing in to staging Admin.
