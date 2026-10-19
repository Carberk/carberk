# Handoff: PR #555 (issue #520 "Cabinet becomes the menu") screenshots

Untracked file. Do not commit it. Do not push, commit, merge or change code for this task.

## Where things are

| Item | Value |
|---|---|
| Repo / PR | bagtyyarkovusov/auto.tm-rewrite, PR #555, branch `claude/project-thread-242m5k` |
| Commit | `b6e9f00ce6fd65563ecd2f63080f3b0c183a80d8` |
| Worktree | `/Users/bagtyyar/Projects/auto.tm-rewrite/.claude/worktrees/pr555-screens` (detached at b6e9f00; main checkout untouched) |
| Screenshot folder | `~/Desktop/pr555-screens/` (only `_probe.png`, a blank test image; delete it) |
| Emulator | AVD `Medium_Phone_API_36.1`, booted, dev build `tm.auto.app` installed |
| Metro | port **8091**, `CI=1`, pointed at the PR-555 backend. Port 8081 belongs to another session's Metro (pid 97019), so leave it alone |
| Logs | `/tmp/pr555-build.log`, `/tmp/pr555-metro.log`, `/tmp/pr555-emu.log` |

## Done

- `pnpm install` in the worktree.
- `pnpm turbo run build --filter=@auto-tm/mobile^...` builds the workspace packages. The first bundle failed with `Unable to resolve "@auto-tm/contracts"` because `packages/contracts/dist` was missing.
- **Expo check:** `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check` reported "Dependencies are up to date".
- `expo run:android` with JDK 17 and ANDROID_HOME set: BUILD SUCCESSFUL, APK installed.
- Metro bundled 3874 modules. The app shows a **blank white screen**, and every API call returns 404 because the backend isn't deployed. I haven't confirmed whether the blank screen comes only from that.

## Blocker: PR-555 backend not deployed

Railway project `auto-tm` `176ddec0-dd65-4087-b82c-798599fc2ebe`, environment `auto.tm-rewrite-pr-555` `8be8da9e-a0c6-4956-aca5-9a1f00e14be5`.

- Postgres, Redis and MinIO are online. api, worker, web and admin have **never deployed** (mobile-only PR, so the watched paths skipped the build).
- api service `6db6f1b1-5c7a-4033-88d0-53f5f315bfc0`, domain `api-autotm-rewrite-pr-555.up.railway.app` (returns 404 "Application not found").
- MinIO service `af9ecdec-433b-48f0-8457-1a13c5ab1ab7`, domain `minio-autotm-rewrite-pr-555.up.railway.app`.
- Auto mode blocked my deploy attempt ("Production Deploy"), even though it was scoped to the PR env. It also blocked `adb shell uiautomator dump`.

## Steps to finish

### 1. Deploy the API at the PR commit (PR-555 env only)

```bash
railway api 'mutation { serviceInstanceDeployV2(serviceId: "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0", environmentId: "8be8da9e-a0c6-4956-aca5-9a1f00e14be5", commitSha: "b6e9f00ce6fd65563ecd2f63080f3b0c183a80d8") }'
```

Wait for `SUCCESS` (Railway dashboard, or `railway deployment list --environment 8be8da9e-a0c6-4956-aca5-9a1f00e14be5 --service 6db6f1b1-5c7a-4033-88d0-53f5f315bfc0`), then:

```bash
curl -s https://api-autotm-rewrite-pr-555.up.railway.app/readyz
```

Before seeding, confirm the api variables in that env: `SMS_DRIVER=mock`, `APP_ENV=staging`, and `MINIO_PUBLIC_URL` is the PR-555 MinIO host. Railway auto-redeploys on a variable change. The worker isn't needed for sign-in, because the mock OTP is logged by the API (`HttpOtpSenderAdapter`).

### 2. Seed (docs/agents/mobile-expo.md, "Railway PR backend sessions" step 4)

```bash
railway ssh --project 176ddec0-dd65-4087-b82c-798599fc2ebe --environment 8be8da9e-a0c6-4956-aca5-9a1f00e14be5 --service 6db6f1b1-5c7a-4033-88d0-53f5f315bfc0 node /app/scripts/native-pr-seed.mjs --remote
```

### 3. Reload the app

If Metro on 8091 is still running:

```bash
adb reverse tcp:8091 tcp:8091
adb shell am force-stop tm.auto.app
adb shell am start -a android.intent.action.VIEW -d "autotm://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8091"
```

To restart Metro from the worktree:

```bash
CI=1 EXPO_PUBLIC_API_URL="https://api-autotm-rewrite-pr-555.up.railway.app/api/v1" EXPO_PUBLIC_WS_URL="wss://api-autotm-rewrite-pr-555.up.railway.app/ws/chat" EXPO_PUBLIC_MEDIA_URL="https://minio-autotm-rewrite-pr-555.up.railway.app" pnpm --filter @auto-tm/mobile exec expo start --dev-client --clear --port 8091
```

Android env for a rebuild:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"
```

If the screen is still blank once the API is up, check `/tmp/pr555-metro.log` for a render error.

### 4. Sign in

Seller fixture `+99361000001`. Read the OTP from the API logs:

```bash
railway logs --project 176ddec0-dd65-4087-b82c-798599fc2ebe --environment 8be8da9e-a0c6-4956-aca5-9a1f00e14be5 --service 6db6f1b1-5c7a-4033-88d0-53f5f315bfc0 --lines 200
```

Keep OTPs and tokens out of PR evidence. For "signed in without a display name", sign in with a phone that has no display name, such as a fresh number (the seed may also leave the buyer `+99361000009` without one).

### 5. Capture, light and dark (the Theme row on Cabinet switches them)

```bash
adb exec-out screencap -p > ~/Desktop/pr555-screens/<name>.png
```

Suggested names:

- `01-cabinet-signed-out-{light,dark}.png`
- `02-cabinet-signed-in-name-{light,dark}.png`
- `03-cabinet-signed-in-no-name-{light,dark}.png`
- `04-profile-bottom-logout-delete-{light,dark}.png`
- `05-logout-confirm-dialog-{light,dark}.png`
- `06-cabinet-signed-out-toast-{light,dark}.png`
- `07-cabinet-ru.png` (one Russian shot; also check that the Turkmen labels fit)

### 6. Check against issue #520

- Signed out: a large Sign in row with "By phone or email", then Language, Theme, Terms of Service, Privacy Policy, Posting rules. No My listings, Log out, Delete account, gear or "List a car".
- Signed in: profile row (display name with the masked method under it, or the masked method alone), then My listings, then the same rows.
- Profile bottom: Log out (with confirm dialog; Cancel keeps the session) and Delete account (opens the existing Delete account screen).
- After Log out: signed-out Cabinet with a "Signed out" toast.
- Rows at least 44 pt. From the code, `MenuRow` uses `min-h-14` (56) and `min-h-[76px]` for large rows, so this looks fine; confirm visually. RU and TK labels must not truncate.
- Posting rules opens the Terms page. That matches main and the founder decision.

### 7. Clean up

Stop Metro on 8091 (not the one on 8081) and the emulator:

```bash
pkill -f "port 8091"
adb emu kill
```

Delete `_probe.png`. Leave the worktree, or remove it with `git worktree remove .claude/worktrees/pr555-screens`.
