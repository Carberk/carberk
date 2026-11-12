# Natural-media benchmark inputs

Use this pack when measuring larger photo preparation or natural road-video preparation/playback for [#1119](https://github.com/Carberk/carberk/issues/1119). This input-only slice ([#1127](https://github.com/Carberk/carberk/issues/1127)) supplies no runtime measurements. [v1/manifest.json](v1/manifest.json) owns exact sources, revisions, licenses, acquisition timestamps, measured bytes/SHA256/probes and conversion commands. [manifest.mjs](manifest.mjs) exports only the deeply frozen definition; apps, seeds and readiness do not import it.

## Obtain and verify the offline pack

The completed operator pack is retained on the founder's Mac at `/Users/bagtyyar/.t3/userdata/artifacts/carberk/review-benchmarks/v1/issue-1127-natural-media`. Preserve that directory when cleaning worktrees. Copy the entire pack, including `manifest.json`, `CREDITS.md`, `sources/`, `library/` and `evidence/`, to another operator machine explicitly. Large media stays outside git, app bundles and public vehicle galleries.

From the repo root, with FFmpeg/ffprobe installed:

```sh
node scripts/review-benchmark.mjs /absolute/path/to/issue-1127-natural-media
```

Success reports corpus/version, definition SHA256, seven files and 391104457 bytes after checking every file's length/hash, container, video/audio metadata and full decode. Verification is read-only and offline, uses at most two decoder threads sequentially at low priority, and requires an explicit directory. Missing, substituted, corrupt or mismatched inputs fail; restore the pinned pack and rerun. No download, conversion, upload or environment repair occurs. `node --test scripts/review-benchmark.test.mjs` tests these refusals without requiring the large pack or FFmpeg in CI.

If reacquisition is necessary, make a new owned directory. Explicitly download each of the five `assets` with a `url` using that exact primary URL and `file` destination, for example `curl --fail --location --output '<file>' '<url>'`. Create `sources/` and `library/` first. If a proxy is needed, pass its correct protocol to curl explicitly; the original acquisition used `--proxy socks5h://127.0.0.1:1082` after the user restored connectivity. Preserve failures and append recovery evidence. Stop on unavailable sources, rejected permissions or unknown paid services; no source substitution or network bypass is part of acquisition.

Verify the downloaded hashes against the pinned definition before conversion. For each `native-library-derivative`, run its exact `transform.command` argument array with the pack root as working directory, one conversion at a time in an assigned heavy-work slot. Retain the FFmpeg version/build and logs. Copy the versioned definition as `manifest.json` and carry the per-source credits below. Run the offline verifier before using any media. Encoder builds can produce different bytes: retain/copy the verified v1 derivatives; a re-encode that changes a hash requires a separately reviewed corpus version, never silently repin v1. Source-page estimates are not local measurements.

## Attribution and input boundaries

Each photo is the unchanged Commons original JPEG, rather than the smaller UI rendition or a camera RAW file. Their title, author, source-page/revision and CC BY-SA 4.0 links are in the manifest. They match the curated front exterior, dashboard and portrait rear-cabin identities from [the UI gallery](../../packages/db/scripts/ui-fixtures/es300h-shenzhen-2025-07-17/v1/README.md).

The night source is **Cars driving at night.webm**, Editor (YouTube user), [Commons](https://commons.wikimedia.org/wiki/File:Cars_driving_at_night.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Its Commons page declares the YouTube origin and records McZusatz's license review on 2013-02-03. The daylight source is **Ending 2+1 road.ogv**, LA2 own work, [Commons](https://commons.wikimedia.org/wiki/File:Ending_2%2B1_road.ogv), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Saved source-page wikitext/API responses and license deeds accompany the pack.

Both clips contain natural road motion with prior transcoding, not phone-camera originals or footage of the Lexus. Native-library MP4s preserve framing and the full visible interval using H.264 High/yuv420p, CRF 18, slow preset. Night retains audio as AAC; daylight remains silent. The manifest explicitly records the night AAC tail and the daylight sparse-frame/CFR holds. These MP4s are library inputs, not phone-prepared uploads. Synthetic UI videos remain separate. Retain individual title, author, source/revision, license links and actual changes when redistributing; distribute share-alike adaptations under the applicable license. `CREDITS.md` in the pack carries these credits. No endorsement or unrelated trademark/personality-right clearance is implied.

## Later measurement procedure and receipt

The integrated operational proof owns local/staging/production execution and its target, account, backup, session and device guards. Follow [local testing](../../docs/agents/local-testing.md) and the [deployment runbook](../../docs/prd/ops/80-deployment-runbook.md) there. This verifier grants no apply/reset/config/deployment authority. Keep the frozen `5ff2106d` release/AAB receipt separate from the implementation and runtime origins.

1. Verify the same offline pack before each target's pass. Record the verifier output, actual source/build/artifact and backend/worker origins, existing session reuse and owned device. Copy only the three JPEGs and two MP4 **library inputs** to the owned device explicitly; retain credits and record the transfer. Keep road clips out of persistent public vehicle inventory.
2. Measure native preparation of each original photo and each clip. Select an actual 90-second night interval in the native editor and record both endpoints; select the full measured 60.000-second daylight interval. Record elapsed preparation and probe/hash the actual resulting files. Library conversion time is input adaptation, excluded from native preparation. Upload only the normal validated prepared outputs (video at most 15 MiB; photo prepared WebP), never the large source files directly to the worker.
3. Record upload elapsed/confirmed bytes and interruptions/resumes. Use existing `preparation_finished`, `upload_interrupted/resumed` observations and worker `listing_video.processed` logs; record worker attempt/elapsed/source/cover/rendition bytes and actual processing manifest. Wall-clock time to Ready includes queue delay and stays separate from processing elapsed. Missing observations are `null` with a reason; failures stay in the receipt.
4. For each clip on staging and production, observe three first-view/immediate-replay pairs at the same selected quality, recording startup, stalls and watched duration. Preserve auth/drafts: use a fresh player/grant and describe OS/CDN caches as unknown unless a supported targeted operation establishes otherwise. A new grant does not prove a cold transport cache. For photos record the supported targeted image-cache operation, or state unknown. No shared cache purge/app-data reset is needed.
5. Retain individual observations outside git. Report the conditions and range; this bounded corpus establishes no population p95, phone/cellular/HDR coverage or invented latency threshold. Use the integrated proof's owned lifecycle for temporary resources and preserve the reusable baseline.

Use one JSON receipt per target/run, with one `samples` entry per photo/clip operation or playback observation. This is a manual format, not new telemetry or a benchmark framework. Replace placeholders with observed values; leave unmeasured numbers `null`, never zero. Keep private IDs/paths/grants/URLs and raw logs in private evidence; public evidence uses aliases.

```json
{
  "status": "not-measured",
  "corpus": "carberk-natural-media-v1",
  "version": 1,
  "definitionSha256": "<offline verifier output>",
  "verificationReceipt": "<private evidence reference>",
  "runAlias": "<operator alias>",
  "observedAt": null,
  "target": "<local|staging|production>",
  "device": { "model": "<actual model or Simulator>", "os": "<version/runtime>", "physical": null },
  "network": { "transport": "<Wi-Fi/cellular/host>", "description": "<conditions>", "shaping": "<none or actual settings>" },
  "build": { "type": "<debug/release>", "sourceSha": null, "artifactSha256": null, "servedOriginsReceipt": null },
  "backend": { "apiDeploy": null, "workerDeploy": null },
  "tools": { "ffmpegBuild": null, "ffprobeVersion": null, "nativeEncoderVersion": null },
  "samples": [{
    "assetId": "<pinned original or MP4 id>",
    "operation": "<prepare-upload|first-view|replay>",
    "pair": null,
    "outcome": "not-measured",
    "failureOrMissingReason": "<reason>",
    "cache": { "player": "<fresh or reused>", "image": "<targeted clear or unknown>", "osCdn": "unknown" },
    "selection": { "startSeconds": null, "endSeconds": null },
    "input": { "sha256": null, "bytes": null, "width": null, "height": null, "videoCodec": null, "audioCodec": null, "durationSeconds": null },
    "prepared": { "sha256": null, "bytes": null, "width": null, "height": null, "videoCodec": null, "audioCodec": null, "durationSeconds": null },
    "preparationMs": null,
    "upload": { "bytes": null, "elapsedMs": null, "interruptions": null, "resumes": null },
    "worker": { "attempt": null, "processingMs": null, "readyWallMs": null, "sourceBytes": null, "coverBytes": null, "renditionBytes": null, "manifestReceipt": null },
    "renditions": [{ "quality": null, "codec": null, "durationSeconds": null, "bytes": null }],
    "playback": { "quality": null, "startupMs": null, "stallCount": null, "stallMs": null, "watchedMs": null },
    "rawEvidenceReceipt": null
  }]
}
```

Current telemetry boundaries: [native preparation](../../apps/mobile/src/listings/video/videoPreparation.ts), [player observations](../../apps/mobile/src/listings/video/ListingVideoPlayer.tsx), [worker observations](../../apps/worker/src/video/VideoProcessingTelemetry.ts). Source checks and successful offline decoding do not establish live device/backend performance.
