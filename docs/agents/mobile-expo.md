# Mobile / Expo agent checks

Use this checklist for any `mobile` issue, Expo SDK package change, Metro failure, Codegen failure, navigation/router change, or Expo Go runtime crash.

For component behavior tests, use the [mobile testing guide](mobile-testing.md).

## First rule

Do not patch `node_modules`, Codegen, Metro resolution, or native-package entrypoints until Expo's dependency check has run. Expo Go ships native modules at SDK-specific versions; mismatched JavaScript packages can compile and still crash at runtime.

## Required package check

Run this before changing versions or debugging native-module crashes:

```bash
CI=1 pnpm --filter @auto-tm/mobile exec expo install --check
```

If it fails, align with Expo first:

```bash
CI=1 pnpm --filter @auto-tm/mobile exec expo install --fix
pnpm install --force
CI=1 pnpm --filter @auto-tm/mobile exec expo install --check
```

`pnpm install --force` is required after package alignment because stale pnpm symlinks in `apps/mobile/node_modules` can keep pointing at the previous store entry.

## Required verification gate

For any mobile change, run:

```bash
pnpm --filter @auto-tm/mobile typecheck
CI=1 pnpm --filter @auto-tm/mobile exec expo install --check
pnpm --filter @auto-tm/mobile exec expo export -p ios --clear
```

For runtime-only bugs or crashes, build and run a development build. Expo Go is
not an option for this app (see the SDK 55 pitfalls below):

```bash
pnpm --filter @auto-tm/mobile exec expo run:android
node scripts/expo-logs.js --once
```

Capture a screenshot for UI/runtime claims. On the Android emulator:

```bash
adb exec-out screencap -p > /tmp/auto-tm-android.png
```

The emulator also needs the host stack reachable, since `EXPO_PUBLIC_*` point at
`localhost`:

```bash
for p in 8081 3006 9000; do adb reverse tcp:$p tcp:$p; done
```

Stop Metro before handing back the task.

## Known SDK 55 pitfalls

- Keep `.npmrc` with `shamefully-hoist=true`; Metro expects flat React Native dependencies under pnpm.
- Keep `react-native-reanimated` and `react-native-worklets` as explicit Expo-installed app dependencies. SDK 55's Expo docs install them together, and Reanimated 4 initializes through Worklets; relying on a transitive Worklets peer can compile but crash in Expo Go with vague `Exception in HostFunction` errors when RNR components import builders such as `FadeIn` / `FadeOut`.
- Keep `react-native-screens` on its React Native/Fabric source path. Do not redirect it to `lib/commonjs`; that caused `RNSSafeAreaView` view-config crashes.
- Do not patch `@react-native/codegen` for `react-native-screens` unless the package check is already clean and a fresh Codegen/parser repro proves the current aligned toolchain still fails.
- `expo-router@55.0.14` ships the internal router modules needed by SDK 55. Do not restore old `expo-router@6.0.23` shims or postinstall patches.
- **Expo Go can no longer run this app.** `app/(tabs)/chat.tsx` imports `useChatPushTokenRegistration`, which pulls in `expo-notifications` at module load; Expo Go dropped remote-push native code in SDK 53, so the app throws on launch. A development build is required for every runtime check. This regressed when S10 added push registration to the chat tab.

## Local Android build pitfalls

- **Use an installed JDK 17 for Android builds and set `JAVA_HOME` explicitly.** With a JDK 21 daemon and no discoverable JDK 17, React Native 0.83.10 attempts toolchain provisioning through Foojay 0.5.0. That resolver references `IBM_SEMERU`, removed in Gradle 9, and configuration fails before compilation. Selecting the installed JDK 17 avoids that provisioning path. On macOS with Homebrew's `openjdk@17`, its home is `<brew-prefix>/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`. Do not patch `node_modules` to work around a missing local JDK. See the [upstream resolver compatibility report](https://github.com/gradle/foojay-toolchains/issues/151).

- **`ANDROID_HOME` must be exported in the shell that runs `expo run:android`.** `apps/mobile/android/local.properties` is not committed and `expo prebuild` does not generate it, so a shell without the SDK env fails at configuration time with `SDK location not found`, even though `adb` may work from an interactive terminal that sources a profile. Export it before building:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

- **Gradle can fail to download `com.facebook.react:react-android` with `bad_record_mac`.** The symptom is many simultaneous task failures that all name the same artifact:

```
Could not download react-android-0.83.10-debug.aar
  > (bad_record_mac) Insufficient buffer remaining for AEAD cipher fragment
```

  This is not a network outage and not a dependency-alignment problem — `curl` fetches the same 236 MB artifact fine. It is the Gradle daemon's JDK TLS 1.3 stack failing on a large AEAD transfer. Confirm the network first, then force TLS 1.2 for the daemon:

```bash
cd apps/mobile/android
./gradlew app:assembleDebug -x lint -x test -PreactNativeArchitectures=arm64-v8a \
  -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g -Djdk.tls.client.protocols=TLSv1.2"
```

  Once the artifact is cached, `expo run:android` succeeds normally. Do not "fix" this by pinning React Native versions or clearing `node_modules`; the artifact coordinates are correct.

## Local release builds

Local release builds fail in ways EAS never sees, because EAS starts from a clean checkout, rebuilds workspace packages in `eas-build-post-install`, and prebuilds native directories fresh. On a developer Mac every one of those artifacts can be stale. Use the guarded helper instead of calling Gradle directly:

```bash
pnpm --filter @auto-tm/mobile build:android:local
```

`apps/mobile/scripts/local-android-release.mjs` rebuilds contracts, regenerates `android/` when branding assets changed, forces the JS bundle task to re-run, and verifies the APK embeds a Hermes bundle before it prints the `adb install -r` command. It defaults to the production backend; override `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` / `EXPO_PUBLIC_MEDIA_URL` to point at a PR backend. The failure modes it guards, for when you must build by hand:

- **Stale `@auto-tm/contracts` dist crashes the app after sign-in.** Metro resolves the package to its gitignored `dist/` via package exports. If `dist/` is older than a source change, the bundle silently lacks the new exports and the app throws `TypeError: undefined is not a function` at the first caller (logcat's componentStack names the calling screen, not the missing function — a profile row crash can be a contracts miss, not a screen bug). Fix: `pnpm --filter @auto-tm/contracts build`, then re-bundle. EAS is immune; this is local-only and never a store bug.

- **Gradle repackages stale JS bundles.** `createBundleReleaseJsAndAssets` tracks neither workspace `dist/` files nor `EXPO_PUBLIC_*` env as inputs, so an incremental `assembleRelease` can report `UP-TO-DATE` and ship the previous bundle. Deleting `app/build/generated/{assets,res,sourcemaps}/react` (plus `intermediates/assets/release` and `outputs/apk/release`) forces a re-bundle without a full native rebuild.

- **The red "Unable to load script" box means the installed APK has no JS bundle.** `expo run:android` can install a mid-build APK; verify before installing: `unzip -l` lists `assets/index.android.bundle` and its first bytes are the Hermes magic `c6 1f bc 03`. Release bundling needs heap: `NODE_OPTIONS=--max-old-space-size=8192`, otherwise Metro OOMs mid-bundle.

- **`expo prebuild` without `--clean` does not regenerate branding.** Launcher icons, splash, and the app name are baked into `android/` and `ios/` at prebuild time and both directories are gitignored. After changing `assets/images/*` icons, the splash, or the display name, run `npx expo prebuild --clean -p <platform>` or the local build keeps the old branding. Store builds are unaffected (EAS prebuilds fresh); check the AAB contents before suspecting the store.

- **Xcode 27 replaced Simulator.app with Device Hub** (Xcode → Open Developer Tool → Device Hub). `simctl` still works headless: build `Release-iphonesimulator` with `xcodebuild`, then `xcrun simctl install <udid> <App>.app` and `xcrun simctl launch <udid> tm.auto.app`.

- **Local iOS builds need a 16.0 deployment floor.** Xcode 27 rejects pod targets below iOS 15.0, and `expo-router`'s npm tarball ships no prebuilt xcframework, so it compiles from source that uses iOS 16 APIs (`UIAction.subtitle`) despite the podspec declaring 15.1. The ExpoRouter pod, the `Pods-Carberk` aggregate target (it compiles `ExpoModulesProvider.swift`), and the app target must all build at ≥ 16.0, via this `post_install` addition to the generated `ios/Podfile` (re-apply after every `prebuild --clean`; EAS's older Xcode never sees this — do not move it into `app.config.js` without a product decision on dropping iOS 15 devices):

```ruby
local_deployment_floor = '16.0'
installer.pods_project.targets.each do |target|
  target.build_configurations.each do |build_config|
    if build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < local_deployment_floor.to_f
      build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = local_deployment_floor
    end
  end
end
installer.aggregate_targets.each do |aggregate_target|
  aggregate_target.user_project.native_targets.each do |target|
    target.build_configurations.each do |build_config|
      if build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < local_deployment_floor.to_f
        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = local_deployment_floor
      end
    end
  end
  aggregate_target.user_project.save
end
```

- **Store builds without cloud credits:** `eas build -p android --profile production --local` runs the same EAS pipeline on this Mac, including EAS secrets such as `GOOGLE_SERVICES_JSON`, without spending cloud build credits. It is slower than the cloud and ties up the machine; keep one heavy local build at a time.

## Android Activity recreation

Android recreates the Activity in place for any configuration change the manifest does not claim, and React Native then mounts the whole React tree again in the same JavaScript runtime. `apps/mobile/plugins/withAndroidActivityRecreation.js` claims `density`, `fontScale`, `locale` and `layoutDirection`, and adds an `onDestroy` override to `MainActivity` so Expo modules register their activity-result launchers again after a recreation the manifest cannot claim (navigation mode or wallpaper colour overlays). Without the override, `expo-image-picker` rejects every launch with `Attempting to launch an unregistered ActivityResultLauncher` until the app is force-stopped. Keep both when changing the plugin list or upgrading Expo, and re-test on a release build:

```bash
adb shell wm density 400 && adb shell wm density reset            # claimed: no relaunch
adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton   # not claimed: relaunch
adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural
adb logcat -d | grep -c "finishDrawing of relaunch.*tm.auto.app"
```

After each, the app must stay on the same screen, signed in, and Profile > Choose from library must open the picker. Module state survives a recreation and component state does not, so a screen that must not flash a loading state reads what the app already knows (`src/auth/sessionSnapshot.ts`).

## Railway PR backend sessions

[ADR-0075](../adr/0075-railway-pr-backends-for-agent-native-sessions.md) uses staging-based Railway PR environments with demo data and mock SMS. The hosted required `pr` check runs container-backed tests. Locally run `pnpm test:unit`, typecheck, affected lint and applicable exports. Keep Docker stopped for native proof. The coordinator assigns explicit simulator UUIDs and distinct Metro ports, with up to two sessions when capacity permits (simultaneous two-app capacity is unproven), and one heavy local phase at a time.

1. Open the issue's draft PR and wait for Railway's `auto.tm-rewrite-pr-<PR>` environment. PR environments are enabled from staging with Bot and Focused modes off. Read the environment ID and API service domain through the Railway dashboard or CLI. Use explicit environment and service IDs on every command. Existing PR clones can retain an old MinIO image; verify the ADR-0074 pinned image and a successful deployment.
2. Prefer one environment-scoped project token shared by agents on this PR, stored outside the repo in an owner-only file and loaded as `RAILWAY_TOKEN`. Verify its `projectToken { projectId environmentId }` scope using `railway api`. A reusable workspace token includes production permissions. When token creation is unavailable, the coordinator's existing CLI session may perform setup, seed, log and redeploy operations on verified PR environment IDs under the [founder-delegated disposition](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/477#issuecomment-5926410525). Native agents receive only the public backend URL. The seed guard restricts this command, not the broad credential itself.
3. Check the API's `/readyz` response for this environment and the PR backend commit. For a tooling or mobile-only PR whose watched paths skipped its initial application builds, the coordinator deploys API and then worker explicitly at the verified PR commit. After backend commits, wait for the corresponding deployment's `SUCCESS` and read the new `commitSha`; a successful prior deployment is insufficient. Confirm worker boot and MinIO readiness. Migrations belong to the API pre-deploy command.
4. Set `MINIO_PUBLIC_URL` to `https://${{MinIO.RAILWAY_PUBLIC_DOMAIN}}` in the PR API and worker services, and `NEXT_PUBLIC_MINIO_PUBLIC_URL` to the same reference in PR admin/web. Staging may contain literal URLs that duplication preserves, so read back hostnames and confirm they belong to this PR. Keep deployed `DATABASE_URL` and `MINIO_ENDPOINT` on private Railway service origins. Confirm `SMS_DRIVER=mock` and `APP_ENV=staging`. After the API image is ready, run one command from the coordinator:

   ```bash
   railway ssh --project "$PR_PROJECT_ID" --environment "$PR_ENVIRONMENT_ID" --service "$PR_API_SERVICE_ID" node /app/scripts/native-pr-seed.mjs --remote
   ```

   The guarded command executes inside the PR API container with its private Postgres and MinIO connections. The image includes the entry point, bucket bootstrap, db seed scripts, generated client, fixture manifest and their runtime dependencies. It bootstraps all four MinIO buckets, reference catalog, fixture users and listings with 0, 1 and 2 photos, then licensed brand logos. Reruns converge without duplicates but are not a no-op: fixture users and listings are deleted and recreated with the same IDs, cascading to their sessions, drafts, favourites, conversations, saved searches and listings created as a fixture seller; sessions end and `publicNumber` advances. Do not reseed during another agent's live session. It rejects production, staging, missing or malformed names, nonmock SMS, wrong project, nonprivate data origins and inherited staging/other-PR media hosts before launching any step or constructing a client. The entry point and the fixture step run the same guard, `packages/db/scripts/native-pr-seed-guard.cjs`, and a malformed connection URL is refused by variable name without printing its value. Do not print variable values or credentials in evidence. Fixture phones include buyer `+99361000009` and seller `+99361000001`.

   `--remote` is the only mode. There is no local mode: `node scripts/native-pr-seed.mjs` without `--remote`, and `pnpm native:seed`, refuse and print this command, because a local run could not be bound to the PR environment's database. `railway run` executes locally and cannot reach the private hostnames this guard requires. Do not enable a public Postgres proxy for a native session; remove an owned unused proxy without touching database data.
5. Point Metro at the PR API URL including `/api/v1`:

   ```bash
   EXPO_PUBLIC_API_URL="$PR_API_URL/api/v1" \
   EXPO_PUBLIC_WS_URL="wss://$PR_API_HOST/ws/chat" \
   EXPO_PUBLIC_MEDIA_URL="https://$PR_MINIO_HOST" \
   pnpm --filter @auto-tm/mobile exec expo start --dev-client --port "$METRO_PORT"
   ```

   `$PR_API_HOST` and `$PR_MINIO_HOST` are the PR API and MinIO public hosts. Without `EXPO_PUBLIC_MEDIA_URL` the app builds no photo URLs and renders no photos. For an installed iOS development client, launch the assigned simulator UUID with the Metro host and port as a launch argument:

   ```bash
   xcrun simctl launch "$SIMULATOR_UUID" tm.auto.app -RCT_jsLocation 127.0.0.1:"$METRO_PORT"
   ```

   `RCT_jsLocation` chooses Metro; the `EXPO_PUBLIC_*` variables choose the backend. Restart Metro with `--clear` if an old API origin remains in the bundle. Expo Go cannot run this app.
6. Log in with a fixture phone. Read the mock OTP from this PR API service's logs with `railway logs --project "$PR_PROJECT_ID" --environment "$PR_ENVIRONMENT_ID" --service "$PR_API_SERVICE_ID" --lines 200`, looking for the last four digits of the request's phone and its time (the line reads `[mock] OTP for ***0009 (req 1a2b3c4d): <code>`; the tag is the first eight characters of the `requestId` the code request returned). Do not put OTPs or access tokens in PR evidence. Capture the loaded feed and a fixture detail/gallery to prove media and API traffic. Record environment ID, successful deployment ID/backend SHA, screenshot paths and the process check showing Docker absent.
7. Stop only this session's Metro process. Revoke an environment-scoped disposable token when finished. Keep reusable coordinator credentials outside the repo. Railway automatically deletes the environment on PR merge/close; verify that its exact environment ID disappears. Close disposable proof PRs promptly and record deletion evidence. Do not close an active implementation PR just to collect cleanup evidence.

## Android package per build profile

The EAS `production` profile builds Android package `com.auto_tm.ynamly`, the Play app that already exists ([#697](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/697)); it sets `ANDROID_APPLICATION_ID` in `eas.json`, which `app.config.js` reads. `staging`, `production-smoke`, development clients and local builds stay `tm.auto.app`. Each package needs its own Android app in its Firebase project, so the production `GOOGLE_SERVICES_JSON` must be the file for `com.auto_tm.ynamly`. The iOS bundle identifier is `tm.auto.app` everywhere. `simctl` and `adb` commands in this guide use `tm.auto.app` because they drive development builds.

## Documentation duty

Update this guide when the operating procedure changes. Update `apps/mobile/CONTEXT.md` only when its documented boundary, constraint, or important limitation changes. Keep individual diagnoses in task evidence. Supersede changed architecture decisions with a new ADR; preserve merged ADR text.
