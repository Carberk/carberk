# Native diagnostics evidence frontier

Official-source review, 2026-10-18. No SDK dependency was installed and no collector was enabled.

## Verified finding

Sentry's React Native filtering guide explicitly states: "The beforeSend callback in the React Native SDK only filters events generated from the JavaScript layer. Native events (from Android, iOS, or other native code) are not filtered."

Source: https://docs.sentry.io/platforms/react-native/configuration/filtering/

Therefore a JavaScript `beforeSend` sanitizer and `sendDefaultPii: false` do not establish the native field/cache contract. The current official React Native options source also says native iOS view-hierarchy accessibility identifiers are not gated by `sendDefaultPii`. Screenshot/view-hierarchy capture must remain disabled rather than relying on that flag. This source observation is not a version-specific compatibility acceptance.

Source: https://github.com/getsentry/sentry-react-native/blob/main/packages/core/src/js/options.ts

Expo's official guide distinguishes runtime error reporting from source-map upload during EAS Build and EAS Update. Build tokens belong in protected build configuration; no token belongs in a binary or public app environment. A working JS error fixture or bundle upload alone cannot prove native crash symbolication or privacy.

Source: https://docs.expo.dev/guides/using-sentry/

Registry metadata reviewed: `@sentry/react-native` 8.31.0 was published 2026-10-15, 8.30.0 on 2026-10-08 and 8.29.0 on 2026-10-01. The workspace uses Expo 55 / React Native 0.83.10 / React 19.2. A latest-version peer range admitting Expo >=49/RN >=0.65 is insufficient evidence for this exact native candidate. No package version is selected by this research.

## Required before native activation

1. Verify an exact stable Expo-compatible SDK release and platform-native pre-send hooks. Prove allowed fields independently on Android and iOS, including early crashes before JavaScript initialization.
2. Verify native cached envelopes, crash artifacts and attachments before delivery, OS backup behavior, and selective removal on account deletion or telemetry reset. Server-side stripping cannot repair prohibited raw collection already persisted on device.
3. Disable screenshots, hierarchy, replay, profiling, automatic interaction/network breadcrumbs, full URLs/bodies and user identity integrations unless separately admitted by the field contract. Build a minimized allowlisted envelope rather than trying to enumerate every secret pattern.
4. Exercise pending offline native crashes across deletion, logout, epoch rotation, reinstall/restore and collector unavailability. Old payloads must not resurrect an erased identity or bypass age limits.
5. Prove exact-release native symbolication in the real controlled candidate, with a real separately deployed collector and protected artifact retention. A Sentry-compatible endpoint is not evidence of GlitchTip native-format/symbolication support.

These are concrete technical acceptance gaps. They do not call for reopening settled product scope or enabling a collector before evidence exists. Independent default-closed monitoring/recovery software can proceed while the native adapter remains closed.

## Exact SDK prewrite inspection (2026-10-18)

The recovered package candidate is React Native 8.29.0, Cocoa 9.30.0 and Android 8.59.0. The Cocoa 9.30.0 source (`SentryCrashMonitor_NSException.m` and `SentryCrashReport.c`) copies `NSException.userInfo` and `reason` into the crash context and writes them in `writeError` while creating the crash report. The report is persisted by `SentryCrashC.c` before normal event processing. The public `beforeSend`/`beforeSendWithHint` callbacks run in the later event pipeline; they are not a prewrite filter for this crash file.

The public Cocoa options expose `beforeSend`, `onCrashedLastRun`, disabled memory introspection, and switches for breadcrumbs/automatic collection. The crash writer callback can append fields but has no supported redaction hook for the already-written native error fields. Android 8.59.0 exposes NDK, tombstone and raw-tombstone switches, but the inspected options do not establish a prewrite allowlist or deletion guarantee for native crash artifacts. These are source findings, not native acceptance proof.

Decision: keep native capture disabled. Options requiring a material decision are (a) qualify a future supported SDK/adapter with executable prewrite and cache-erasure proof, or (b) change the privacy contract after review. Maintaining an SDK fork is out of scope.
