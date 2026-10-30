# Candidate Expo alignment, 29 October 2026

The assembled service recovery exposed two recommendations from the installed Expo dependency validator. Coordinator owns this dependency-only repair; the service checkpoint and its RED/GREEN history remain unchanged.

- RED: `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check` required `expo ~55.0.32` and `expo-sharing ~55.0.25`, with the intentional TypeScript exclusion honored. Receipt: `/tmp/candidate-a-expo-patches-red.log`.
- The prescribed `expo install --fix` first refused with `ERR_PNPM_UNUSED_PATCH`: Expo 55.0.32 depends on Modules Core 55.0.27, leaving the existing 55.0.26 native backport unused. No dependency-validation exclusion was added.
- Inspected the published 55.0.27 `android/cmake/main.cmake`. It still imports Worklets through the obsolete AGP path. Retargeted the existing patch to 55.0.27 with byte-identical contents/hash `9c2fcadc48eccd8ef1784c5059f2bf32e8c76696c99d3bc00bc7a356b04a88fa`; Reanimated's existing patch is unchanged.
- Updated only the two mobile direct versions and that patch target. `pnpm install --force` passed, applying the patch and refreshing symlinks. Receipt: `/tmp/candidate-a-expo-patches-force.log`.
- GREEN: the same Expo dependency check reports `Dependencies are up to date`. Receipt: `/tmp/candidate-a-expo-patches-green.log`.

The lockfile changes Expo to55.0.32, Sharing to55.0.25, Modules Core to55.0.27, Expo CLI to55.0.37, autolinking to55.0.28 and adds config-plugins55.0.12/xcode4.0.0 through Expo's dependency graph. Existing React19.2.0, React Native0.83.10, Worklets0.7.4 and Reanimated4.2.1 remain pinned. No unrelated direct dependency or TypeScript policy changes.

Docs/version evidence: official npm registry metadata for [Expo55.0.32](https://registry.npmjs.org/expo/55.0.32), [Sharing55.0.25](https://registry.npmjs.org/expo-sharing/55.0.25) and [Modules Core55.0.27](https://registry.npmjs.org/expo-modules-core/55.0.27), published21October2026 at15:16:09Z,15:17:38Z and15:18:06Z respectively. The first two accept the existing React/React Native peers; Modules Core accepts Worklets `^0.7.4 || ^0.8.0`. These package manifests declare no engines field. The official SDK upgrade page returned HTTP403; no successful read of it is claimed. The repository [mobile guide](../../agents/mobile-expo.md), installed validator and actual published CMake source govern this bounded repair.

This establishes dependency alignment and patch application only. Full assembled mobile tests/typechecks/lint, iOS export, clean native release builds, artifact inspection and emulator acceptance remain required. No build, signing change, store upload or device session was performed in this dependency window.
