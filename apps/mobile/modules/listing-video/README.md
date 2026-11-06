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
a half-written file never reaches a caller. Each job uses an exclusive
native UUID directory; internal source copies are removed when export ends,
and failed/cancelled jobs remove their directory. Successful prepared files
remain durable across JavaScript sessions.

## Choice of native approach (Expo 55.0.32 / RN 0.83.10)

| Option | Interval trim | ≤30 fps + 720p fit | Bitrate ≤15 MiB | HDR→SDR | Verdict |
|---|---|---|---|---|---|
| Custom Expo module on AVFoundation (iOS) | Reader time-range, frame-accurate | Video composition | Writer bitrate | 709 writer colour | **Chosen, iOS** |
| Media3 Transformer (Android) | Same contract | Same contract | Same contract | Same contract | **Chosen for #1050** |
| FFmpegKit / FFmpegKitNext | Yes | Yes | Yes | Yes | Original retired; Next is source-only and adds a separate native build |
| react-native-compressor | No frame-accurate interval API | Partial | No cap guarantee | Not exposed | Does not cover the contract |
| expo-video / expo-image-manipulator | Playback / images only | — | — | — | Wrong surface |

One small Expo module owns both platforms behind the TypeScript
interface above; Android lands in #1050 and currently rejects with
`unsupported-platform`.

[FFmpegKit's upstream](https://github.com/arthenica/ffmpeg-kit#readme)
points to its source-only successor. The
[compressor API](https://github.com/numandev1/react-native-compressor#video)
does not expose the complete trim/colour/size contract.

## Still unproven

- Android implementation and proof: #1050 (Media3 Transformer).
- Real devices, the Carberk development build calling this module,
  picker/provider recovery, and background interruption: #1044/#1045.
- Full founder-sample matrix, physical-device colour fidelity and final
  activation: #1058. Runtime measurements belong in the PR description.
