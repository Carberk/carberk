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

Visual look is exempt from artificial red tests. Native light/dark/Reduced Motion capture is pending assigned-device handoff. Shared functional blue awaits #827 integration.

## Gates

At `7d80c9e4`, hosted required `pr` passed. Mobile lint and focused rendered/config checks passed. Repository `pnpm test:unit` passed, including 304 mobile files and 3316 tests, and `pnpm typecheck` passed before final native-release cleanup; these gates will rerun after shared-theme integration. Expo dependency check, iOS export, `pnpm test:agent-docs`, and `pnpm check:glossary` passed. No Docker was started.

## Native runtime preparation

Android AVD `Medium_Phone_API_36.1` is assigned as emulator-5554. The reused `/tmp/claude-batch/apk/installed.apk` was debuggable but lacked ExpoBlurTargetView, so its redbox is a native-client mismatch, not launch proof. A current standard `expo run:android --variant debug` build with JDK 17 is underway in this worktree. Native folders stay generated and ignored. Android uses staging API `https://api-staging-2861.up.railway.app/api/v1` and media `https://minio-staging-5795.up.railway.app`, with own Metro 8083. The iOS simulator remains assigned to the Batch 5 writer until explicit handoff.

## Documentation lookup

Context7 `/expo/expo` verified font errors and splash release; `/software-mansion/react-native-reanimated` verified timing/delay and Reduced Motion. Later Android CLI lookup hit Context7 monthly quota after one retry. Official [Android adb documentation](https://developer.android.com/tools/adb), [Expo debug build guidance](https://docs.expo.dev/guides/local-app-development/) and [SDK 55 SplashScreen documentation](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/) supplied fallback. SDK 55 guidance limits Android development builds as proof of standalone native splash properties; the eventual EAS cloud release artifact still needs its cold-launch check.
