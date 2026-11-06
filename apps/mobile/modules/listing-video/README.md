# Listing video preparation (#1039)

Phone-side preparation for one Listing video: copy a library video into
app storage, re-encode only the kept interval as H.264/AAC at most
30 fps, fit 1280x720 / 720x1280 without upscaling, normalise HDR to
BT.709 SDR, and hand back one staged file of at most 15 MiB — or a
typed error. Integration into the seller flow is #1044; this module is
not called by any screen yet.

## Interface

`prepare(source, startS, endS, coverS, onProgress?) -> { done, cancel }`
in [src/index.ts](src/index.ts). `done` resolves to
`PreparedVideoFile` (`uri, durationS, sizeBytes, width, height, fps,
hasAudio`) or rejects with `ListingVideoError` whose `code` is one of
`invalid-interval | invalid-cover | invalid-source |
source-unreadable | unsupported-source | insufficient-storage |
cancelled | export-failed | output-too-large |
unsupported-platform`. Intervals are 3–90 s; the cover must sit inside
the interval. Native output is written to `prepared.partial.mp4` and
promoted to `prepared.mp4` only after `validateOutput` reopens it, so
a half-written file never reaches a caller.

## Choice of native approach (Expo 55.0.32 / RN 0.83.10)

| Option | Interval trim | ≤30 fps + 720p fit | Bitrate ≤15 MiB | HDR→SDR | Verdict |
|---|---|---|---|---|---|
| Custom Expo module on AVFoundation (iOS) | Reader time-range, frame-accurate | Video composition | Writer bitrate | 709 writer colour | **Chosen, iOS** |
| Media3 Transformer (Android) | Same contract | Same contract | Same contract | Same contract | **Chosen for #1050** |
| FFmpegKit | Yes | Yes | Yes | Yes | Retired upstream (Jan 2025); no maintained SDK 55 build |
| react-native-compressor | No frame-accurate interval API | Partial | No cap guarantee | Not exposed | Does not cover the contract |
| expo-video / expo-image-manipulator | Playback / images only | — | — | — | Wrong surface |

One small Expo module owns both platforms behind the TypeScript
interface above; Android lands in #1050 and currently rejects with
`unsupported-platform`.

## iOS Simulator proof (2026-11-06, iPhone "Carberk Video Review", iOS 26.2)

The proof harness compiled the module's own
[ios/ListingVideoExporter.swift](ios/ListingVideoExporter.swift)
unchanged into a throwaway Simulator app, copied each bundled clip
into Application Support, exported 2 s–8 s, and measured the result
with AVFoundation. Synthetic clips (ffmpeg `testsrc2`); no founder
samples.

| Clip (12 s source) | Output | Duration | Size | fps | A/V end drift | Colour |
|---|---|---|---|---|---|---|
| Portrait 720x1280 + audio | 720x1280 avc1 | 6.00 s | 1,011,053 B | 30 | 0 s | BT.709 |
| Landscape 1280x720 + audio | 1280x720 avc1 | 6.00 s | 1,001,514 B | 30 | 0 s | BT.709 |
| 1920x1080 60 fps | 1280x720 avc1 | 6.00 s | 994,959 B | 30 | 0 s | BT.709 |
| HEVC HDR (BT.2020 PQ) | 1280x720 avc1 | 6.00 s | 1,247,196 B | 30 | 0 s | BT.709 |
| Silent 1280x720 | 1280x720 avc1, no audio | 6.00 s | 964,575 B | 30 | — | BT.709 |
| Rotated 90° (MOV matrix) | 720x1280 avc1 | 6.00 s | 997,578 B | 30 | 0 s | BT.709 |

Also proven on the Simulator: every export reported progress and
landed in app storage (`stagedInAppStorage`); cancelling a 12 s
export rejected with `cancelled` and left no `prepared.mp4`; a
truncated copy of a good export was rejected by `validateOutput`
(`export-failed`, never promoted). A frame pulled from the rotated
output is upright, full-frame, and shows the source timecode at
5 s (2 s interval start + 3 s), confirming the interval offset.
At 90 s the bitrate formula gives (1,228,158 + 128,000) x 90 / 8 =
15.3 MB, under the cap; native validation and the TS layer both
reject anything over 15 MiB.

### Founder samples (same Simulator run, 2026-11-06)

Founder-supplied 4K HEVC HDR originals, exercised through the
approved FullHD derivatives (1080x1920 HEVC HLG at 59.94 fps with
AAC; private source media, never committed). Both exported 5 s-35 s
to 720x1280 avc1 at 30 fps, BT.709, 0.001 s A/V end drift:
IMG_7997 derivative 5,310,553 B and IMG_7999 derivative 5,293,725 B
for 30 s. A 5 s-95 s (90 s) export of the IMG_7997 derivative
measured 15,703,512 B, under the 15 MiB cap (15,728,640 B) on real
content. A frame pulled from the 30 s output is upright with
natural SDR colour.

## Still unproven

- Android implementation and proof: #1050 (Media3 Transformer).
- Real devices, the Carberk development build calling this module,
  picker/provider recovery, and background interruption: #1044/#1045.
- Full founder-sample matrix and final activation: #1058. The two
  samples above prove this pipeline on real HDR phone content on
  the Simulator; physical-device fidelity remains for #1058.
