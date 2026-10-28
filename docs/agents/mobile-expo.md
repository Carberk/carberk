# Mobile / Expo agent checks

Use this checklist for any `mobile` issue, Expo SDK package change, Metro failure, Codegen failure, navigation/router change, or Expo Go runtime crash.

For component behavior tests, use the [mobile testing guide](mobile-testing.md).

For EAS builds and signing, use the host's [existing CLI session and managed credentials](cli-access.md) before requesting access or a keystore.

## First rule

Do not patch `node_modules`, Codegen, Metro resolution, or native-package entrypoints until Expo's dependency check has run. Expo Go ships native modules at SDK-specific versions; mismatched JavaScript packages can compile and still crash at runtime.

Preserve the current mobile media limits. Before changing compression or upload resolution, inspect their source/contracts and run the applicable mobile gate; package resolution preserves `shamefullyHoist`.

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

`typescript` is the one deliberate exception. Expo SDK 55 expects `~5.9.2`, but the workspace catalog keeps TypeScript 6 under that name and type-checks with TypeScript 7 ([which compiler runs where](typescript-runtime.md#which-compiler-runs-where)). `apps/mobile/package.json` lists it in `expo.install.exclude`, so the check skips it. Metro compiles with Babel; Expo only uses `typescript` to load TypeScript config files, and this app's config is JavaScript. Do not run `expo install --fix` to "repair" it.

## Android Worklets prefab patches

The workspace carries two native build patches for Expo Modules Core 55.0.26 and Reanimated 4.2.1. They backport [Expo #43863](https://github.com/expo/expo/pull/43863) and [Reanimated #8685](https://github.com/software-mansion/react-native-reanimated/pull/8685), linking Worklets through its published prefab target. The original consumers hardcode an obsolete AGP output path and fail on clean Debug and Release builds. Worklets 0.7.4 already includes the required prefab cache fix.

Install through pnpm so the committed patches and lockfile apply consistently. Do not copy shared libraries into the old output directory. Remove each patch when its installed package includes the upstream fix, then repeat the clean native build gate.

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

## Guarded native development sessions

Use `native:metro` for a reserved staging backend. The executable helper also recognizes legacy PR environments during recovery. Pass an unused port explicitly. The helper reads the selected Railway api service's public API/socket domain and `MINIO_PUBLIC_URL`, refuses production, and checks API readiness, the media host and all three origins in the served bundle. Missing media configuration causes grey card Photos; a missing API configuration falls back to localhost. Railway variable output stays captured. Only public origins are printed.

```bash
pnpm --filter @auto-tm/mobile native:metro -- --env pr-842 --port 8842
pnpm --filter @auto-tm/mobile native:ios -- --udid <SIMULATOR_UUID> --port 8842
```

`--env staging` selects staging. The Railway CLI must support `variables --project`; resolve the current authenticated binary under [CLI access](cli-access.md) and set `RAILWAY_CLI` when another binary precedes it on PATH. Historical host paths and versions are not current access evidence. The helper rebuilds contracts before starting Metro, disables dotenv overrides, refuses an API, socket or media origin outside `*.up.railway.app`, and refuses a port held on any address, including loopback, without stopping its process. Its failure cleanup signals only the Metro process group it created. Stop that Metro session before handing back native work.

Run `native:ios` from the same worktree after Metro reports its guarded bundle is ready. It verifies the selected bundle against the public-origin receipt in gitignored `.expo/` before any native build. Select a simulator that this session owns; an install and launch replace the app on that selected simulator. Preserve other device and Metro sessions.

The iOS helper uses `expo prebuild`, UTF-8 CocoaPods, `xcodebuild` Debug for `iphonesimulator`, and `simctl` for the explicitly selected simulator. This bypasses Expo's Simulator.app discovery failure observed on this Xcode 27 host. `IPHONEOS_DEPLOYMENT_TARGET=16.0` is a command-line override for this local simulator build only, covering older pod targets and Router link preview. Shipped Expo platform minimums remain in app configuration. This route installs development clients; release binaries and store operations use their own workflows.

See [Expo CLI](https://docs.expo.dev/more/expo-cli/) and [Railway variable reference](https://docs.railway.com/cli/variable).

## Known SDK 55 pitfalls

- Keep `shamefullyHoist: true` in `pnpm-workspace.yaml`; Metro expects flat React Native dependencies under pnpm. pnpm 11 and later read only auth and registry settings from `.npmrc`, so the setting cannot live there.
- Keep the `react-native-css-interop` override in `pnpm-workspace.yaml` ([ADR-0048](../adr/0048-pin-react-native-css-interop-with-a-pnpm-override.md)); pnpm 11 and later ignore the `pnpm` field of `package.json`.
- pnpm fails the install when a dependency's install script is not listed in `allowBuilds` in `pnpm-workspace.yaml`. When a new native package needs its script, review it and add it with a comment saying why; deny a script the app does not need with `false`.
- Shared dependency ranges live in the default `catalog` in `pnpm-workspace.yaml`, and package files say `catalog:`. Mobile declares its own `react`, `react-dom` and `tailwindcss` ranges because Expo SDK 55 and NativeWind 4 pin them.
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

`apps/mobile/scripts/local-android-release.mjs` rebuilds contracts, regenerates `android/` when branding assets changed, forces the JS bundle task to re-run, and verifies the APK embeds a Hermes bundle before it prints the `adb install -r` command. It defaults to the production backend; override `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` / `EXPO_PUBLIC_MEDIA_URL` to point at reserved staging. The failure modes it guards, for when you must build by hand:

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

## Shared staging native sessions

Follow [staging reservation](shared-staging.md) for ownership, identity, deployed SHA, fixtures and restoration. Final acceptance uses the reviewed/fixed integration candidate; earlier reservations may provide investigation or reviewer device proof. Hosted disposable services remain the container-backed repository test gate. Locally run unit tests, repository typecheck, affected lint and applicable exports; keep Docker stopped for native proof.

The coordinator assigns explicit simulator UUIDs and distinct Metro ports, serializes heavy local phases and shares only public backend origins with native agents. Use guarded `native:metro` and `native:ios` entrypoints above. Confirm API/socket/media origins in the served bundle, `/readyz`, loaded feed and detail/gallery before claiming API/media evidence. Login secrets and tokens never belong in screenshots or PR evidence. Read mock OTPs only from the verified staging API's logs, matching request ID and time.

The existing `native-pr-seed` entrypoint and shared database guard require a PR environment and reject staging before constructing clients or launching steps. Its fixture reset deletes/recreates users/listings and cascades to sessions and related records. Do not rename or relax the guard to seed staging. The transition must implement reservation-bound staging identity and fixture/reset safety first; fixture-dependent evidence is blocked until that operational path is verified. A local/public database proxy is not a substitute.

Stop owned Metro/device sessions before restoration, retain exact deployment/device/artifact evidence and hand back to Chief of Staff. Failed restoration retains the reservation. Production binaries and promotion follow their separate release gates.

## Android package per build profile

The EAS `production` profile builds Android package `com.auto_tm.ynamly`, the Play app that already exists ([#697](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/697)); it sets `ANDROID_APPLICATION_ID` in `eas.json`, which `app.config.js` reads. `staging`, `production-smoke`, development clients and local builds stay `tm.auto.app`. Each package needs its own Android app in its Firebase project, so the production `GOOGLE_SERVICES_JSON` must be the file for `com.auto_tm.ynamly`. The iOS bundle identifier is `tm.auto.app` everywhere. `simctl` and `adb` commands in this guide use `tm.auto.app` because they drive development builds.

When recovering Android release metadata, use the existing production EAS project before requesting credentials. Follow the [read-only lookup and current receipt](../evidence/issue-897/play-signing-metadata-recovery-20261021.md#fresh-eas-recovery-2026-10-23-utc). Select `production` and filter builds by `com.auto_tm.ynamly`; other profiles are a different app. An EAS build code is not the all-track Play upload maximum, and the EAS upload certificate is not Google's app-signing certificate. Read the credentials summary only; metadata recovery does not require a key export or signing change.

## Documentation duty

Update this guide when the operating procedure changes. Update `apps/mobile/CONTEXT.md` only when its documented boundary, constraint, or important limitation changes. Keep individual diagnoses in task evidence. Supersede changed architecture decisions with a new ADR; preserve merged ADR text.
