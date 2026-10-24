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

## Bounded artifact preparation, 2026-10-24

The #897 implementation contribution adds [offline artifact association](../../../apps/mobile/scripts/diagnostic-artifacts.md) under mobile scripts. Its `prepare` command requires an independently supplied expected candidate identity and exported build metadata plus actual supplied output files. It compares full SHA, app ID, platform, build number, release/dist and explicit bundle/runtime/update identity, verifies SHA256 declarations for distributable, final JS/Hermes bundle/map and Android R8 mapping, and optionally compares exported architecture-specific native binary/symbol IDs. No build identity is inferred from app.config, local defaults, EAS remote versions or Play/signing state.

The helper retains private independent copies outside the mobile cleanup tree, including the exported metadata, refuses destination overwrite, and rechecks retained digests and identity with `verify`. This preserves the final associated outputs before the existing local build helper deletes generated maps/APKs or regenerates Android on the next build. Existing local/EAS build commands and cleanup behavior are unchanged. Retained artifacts are restricted deployment inputs, never public runtime config. Source paths appear only in protected metadata and local errors, not success output.

Offline outcome fixtures cover missing/mismatched identity, declared digest and output refusal, final map/symbol association, unsupported native status, overwrite refusal, private permissions, path substitution and retained verification after dummy build-output cleanup. These fixtures use dummy bytes. They do not establish an actual native artifact, map composition, binary/debug-ID parsing, ABI coverage, signing, collector compatibility or readable symbolication. Exported IDs are declarations from a future actual build/export record, not authenticated binary-derived proof. Empty native association is `unsupported-incomplete`; matching exported IDs are `exported-metadata-only-incomplete`. Neither is PASS for native acceptance.

Docs: not applicable to external dependencies. This uses Node built-ins and existing pnpm commands; no SDK, vendor, framework, native parser or dependency change is introduced. The supplied `/tmp/897-native-capture-preparation-research-20261024.md` and spec81 Capture and delivery contract / Acceptance evidence 1, 3 and 6 govern this bounded source scope. No native builds, devices, runtime exports, dependency doctor, services, collector traffic, credentials or upload were used. Source-only checks and exact checkpoint/log hashes are returned to the parent in `/tmp/897-native-artifact-preparation-20261024-handoff.md`; this receipt is not full candidate qualification.

The prewrite-safe native adapter, bounded cache/purge/restore lifecycle, first-party native receiver contract, actual final build/export provenance, binary association inspection and real controlled collector/symbolication evidence remain open. Parent PR904 owns assembly, independent review, applicable candidate checks and later authorized runtime acceptance. This preparation does not close #919 or establish readiness, and does not block independent B1/UI implementation.
