# Native Listing video preparation proof #888

Supplied base `7af49d4c1474b2c3d841b14736c4ef59ce155a4e`, campaign #897. Writer owns `agent/issue-888`; no issue PR. This checkpoint provides a native preparation interface and bounded feasibility evidence. Seller UI and rollout remain separate.

| Criterion | Evidence | Result |
|---|---|---|
| Compare SDK-compatible native choices | [Selection and official sources](selection.md), local-module discovery, native compiler checks | pass |
| Trim, scale, frame rate, AAC and output limits | iOS26.2 same-engine fixture app, [receipt](ios-simulator-receipt.json), independent [full-output inspection](ios-output-inspection.json) | pass for named simulator fixtures |
| Cancel, unsafe path and completed-file recovery | Same native harness cancels90s job, refuses unsafe ID, recreates engine and inspects journal/output, duplicate ID preserves file | pass for named simulator cases |
| Android native compatibility | Expo autolinks module; Gradle compileDebugKotlin with Media3 1.8.0 | compile pass; runtime blocked |
| HDR/HEVC, source provider, hardware and resource stress | Explicit remaining gates below | pending final campaign |
| Implementation-ready interface and bounded choice | VideoPreparationPort and local Expo module, module README | pass with stated limitations |

## Red and green

Red pushed checkpoint `8a91270c`: `pnpm --filter @auto-tm/mobile exec vitest run src/listings/videoPreparation/VideoPreparation.spec.ts`,14 failures/1 pass. Pass-through returned unvalidated/original/late-cancelled output and allowed concurrent preparation. Green same command16 pass, including duplicate-generation preservation. These fake-boundary tests establish application handoff behavior, not native export.

2026-10-14 checks: mobile full unit suite317 files/3498 tests pass; mobile TS7 and TS6 no-emit pass after building contracts; mobile lint, glossary and runtime-import gate pass after contracts/DB generation builds; Expo dependency check pass; iOS Expo export pass. Android `:listing-video-preparation:compileDebugKotlin` pass with JDK17, SDK36 and Media3 1.8.0. Google Maven initially failed TLS handshake; documented TLS1.2 daemon setting resolved it. iOS prebuild/pod install discover local module. iOS simulator engine/harness compiled with actual iOS SDK. `xcodebuild -project Pods/Pods.xcodeproj -target ListingVideoPreparation -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO IPHONEOS_DEPLOYMENT_TARGET=16.0 build` passes including Expo Record/Promise wrapper. Podspec follows existing15.1 application support;16.0 is the documented local Xcode build floor.

## Actual native fixture run

iOS26.2 AutoTM QueueB iPhone17 `3A8BB230-13C9-4624-8239-395A6E887D4C`, separate bundle `tm.auto.video-proof-888`, no Metro/backend. Native AVFoundation produced:

| Source/selection | Output |
|---|---|
| Permissioned MDN flower,1–4s |960x540,30fps,H264/AAC,3s,1511194 bytes |
| Synthetic4K60,0–1s |1280x720,30fps,H264,1s,739754 bytes |
| Synthetic portrait60,0.5–1.5s |720x1280,30fps,H264,1s,488849 bytes |
| Synthetic91s,0–90s |320x180,30fps,H264,90s,12793577 bytes |

All outputs are tagged SDR BT709 and independently decode completely with desktop FFmpeg exit0. FFmpeg only inspected native outputs; it did not prepare them. Flower audio/video both last3s; perceptual sync is not established. iOS compressed-reader buffers repeated presentation timestamps because they may carry grouped compressed samples. Validation now decodes frame samples through AVAssetReader and counts unique actual presentation timestamps. No framerate clamping or metadata invention. A reproducible fixture-only build script lives at `apps/mobile/modules/listing-video-preparation/proof/build-ios.sh`; it takes the fixture directory and an owned output directory.

Fixture checksums are in [fixtures.json](fixtures.json). Flower comes from https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4, CC0. Synthetic fixtures are generated test patterns. Source fixtures remain under `/tmp/carberk-video-886`; independent receipt hashes identify exactly what ran. The first harness selected beyond the short synthetic durations and correctly refused them. Corrected valid selections passed. No claim about unsupported source ranges follows from that fixture mistake.

## Remaining gates and ownership

Both available Android emulators failed T3 device_open before boot. No further boot loop or global AVD repair. Android output/colour/frame cadence, cancellation/provider behavior remain for coordinator's consolidated native campaign when the environment is restored.

Physical founder FullHD60/4K60 camera recordings, HDR/HEVC/tone-map correctness, actual acceleration/thermal/memory cost, camera rotation metadata, perceptual audio sync, background/process interruption and picker-provider reopening remain unproven.10-minute/2-GiB source and15-MiB output caps are provisional, despite the small90s output fitting. No2GiB allocation/storage-exhaustion simulation ran. iOS supports local file URI only; provider asset copying/reselection and resource eviction must be added in seller orchestration. No recovery API, partial-directory sweep, resumed upload or UI is delivered here. JSON journals prove file completion but filesystem durability under power loss is not certified. Android media probing is currently main-thread; production orchestration must measure/move blocking work before activation.

Final campaign owns physical samples and full production module JS bridge/runtime coverage. Android runtime missing evidence prevents a full native-support claim. Hosted repository/CI gates and integration independent review belong to parent #897/PR904. No staging, production/provider/paid operations ran.
