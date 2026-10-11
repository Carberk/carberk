# Issue 833 verification

Implementation PR: #834. Launch refines the existing Carberk identity, with exact subordinate "By Alpha Motors" credit. Release preparation advances app metadata and inherited EAS version to 2.0.4. No release build runs locally.

## Rendered behavior evidence

| Criterion | Red checkpoint and result | Green command and result |
|---|---|---|
| Credit, startup independence, one entrance, Reduced Motion | `8c3ad6ac`: four failures against pass-through scaffold, missing credit/layout view | `pnpm --filter @auto-tm/mobile test:unit src/launch/LaunchEntrance.render.spec.tsx test/routes/onboarding-back.spec.tsx test/routes/onboarding-flow.spec.tsx`: 49 tests pass |
| Font/locale failures | `22cc2ebe`: two missing destination assertions, plus unhandled locale rejection | Same rendered command passes with root resource fallbacks |
| Saved-theme settlement | `bd11f177`: destination appeared before pending theme resolved | Same rendered command passes; destination absent until saved theme resolves |
| Single layout-owned native release | `727b05b5`: six premature native-hide assertions failed | Same rendered command passes after removing navigation/Language hide paths |
| Release 2.0.4 | `5e59e6d1`: expected 2.0.4, received 2.0.3 | `pnpm --filter @auto-tm/mobile test:unit src/config/easBuildConfig.spec.ts`: 20 tests pass |

Visual look is exempt from artificial red tests. Native captures below prove the existing identity and exact credit. Shared functional blue awaits #827 integration.

## Gates

At `7d80c9e4`, hosted required `pr` passed. Mobile lint and focused rendered/config checks passed. Repository `pnpm test:unit` passed, including 304 mobile files and 3316 tests, and `pnpm typecheck` passed before final native-release cleanup; these gates will rerun after shared-theme integration. Expo dependency check, iOS export, `pnpm test:agent-docs`, and `pnpm check:glossary` passed. No Docker was started.

## Native runtime preparation

Android AVD `Medium_Phone_API_36.1` is assigned as emulator-5554. The reused `/tmp/claude-batch/apk/installed.apk` was debuggable but lacked ExpoBlurTargetView, so its redbox is a native-client mismatch, not launch proof. A current standard `expo run:android --variant debug` build with JDK 17 passed in this worktree, installed only on emulator-5554. Android manifest/package reports DEBUGGABLE and version 2.0.4. Native folders stay generated and ignored. Android uses staging API `https://api-staging-2861.up.railway.app/api/v1` and media `https://minio-staging-5795.up.railway.app`, with own Metro 8083. After explicit handoff, iOS used own Metro 8084. Both owned Metro processes are stopped. Android is handed back to the Batch 5 writer; iOS is available, restored to light appearance and Reduced Motion off.

## Documentation lookup

Context7 `/expo/expo` verified font errors and splash release; `/software-mansion/react-native-reanimated` verified timing/delay and Reduced Motion. Later Android CLI lookup hit Context7 monthly quota after one retry. Official [Android adb documentation](https://developer.android.com/tools/adb), [Expo debug build guidance](https://docs.expo.dev/guides/local-app-development/) and [SDK 55 SplashScreen documentation](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/) supplied fallback. SDK 55 guidance limits Android development builds as proof of standalone native splash properties; the eventual EAS cloud release artifact still needs its cold-launch check.

## Native appearance and handoff

- iOS iPhone 17 Pro `D8081755-61D5-42FE-AFAD-E44DAAF6BA7F`: [light identity](ios-light-credit.png), [dark identity](ios-dark-credit.png), [Reduced Motion identity](ios-reduced-credit.png). These PNGs are unmodified frames extracted from native recordings. The entrance intentionally retains native #17191D in both themes, then crosses into the saved destination theme.
- [Light launch video](ios-light-launch.mp4) at source `c8638a52` shows a continuous C-dot position, wordmark/credit reveal and destination crossfade. It also proves the status-bar remount fix keeps light glyphs over the dark entrance when light Home mounts beneath it. That visual fix is exempt from an artificial red test.
- [Dark launch video](ios-dark-launch.mp4) and [Reduced Motion video](ios-reduced-launch.mp4) at source `2e6dad1c` show no blank interval during native-to-React handoff. The later status-bar key fix changes no dark/reduced appearance or entrance timing. Reduced Motion was set before cold launch; the native Reanimated warning confirms it was enabled, and the wordmark/credit is static before the destination appears. Its bottom warning banner is development-only, unrelated to product UI.
- [Android debug identity](android-debug-credit.png) and [Android debug launch](android-debug-launch.mp4) prove correct React identity and destination appearance, but the debug recording has a black interval between native C-dot and React startup. This does **not** pass #833's no-blank standalone acceptance criterion. Root will test an EAS cloud staging APK after all source is integrated, then the production AAB after promotion. No local release build or release testing was run.
- The iOS staging session survived cold launches; authenticated favorites and Message badge still appear. Rendered tests retain deep-link priority and the tabs Back anchor.

## Handoff at c8638a52

49 launch/onboarding rendered tests, mobile typecheck and mobile lint pass after the status-bar fix. The newest hosted required `pr` is running. Earlier code `7d80c9e4` and documentation `2e6dad1c` required checks passed. Repository unit/typecheck and export must rerun after #827/main integration and color changes. Queue root owns the single fixed-commit review round and merge. This issue remains incomplete until shared colors, final gates and Android standalone handoff evidence pass.
