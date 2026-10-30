# Prepared byte processing checkpoint

The local `FFmpegVideoProcessor` processes real files into HLS and a cropped JPEG poster. It does not download source objects, upload/read back generated objects, persist durable work or mark a generation READY. The registered video queue still rejects work. The worker Dockerfile now pins and installs FFmpeg/ffprobe under77e30050; no image build or deployed binary receipt is claimed. Production activation remains closed.

The adapter permits only a local regular prepared file with a matching SHA-256, at most15 MiB, H264/yuv420p SDR MP4/MOV, at most90 seconds, at most30 fps, at most1280x720 or720x1280, and optional AAC mono/stereo. It fully decodes accepted bytes before generating even-pixel240/360/720 envelope tiers without upscaling. Poster offset must be inside the measured clip. Output inventory contains exact relative names, byte lengths, hashes, content types and poster/playback purposes. Commands use no shell or network input protocols, bounded process times and bounded captured output. One adapter instance processes one job at a time.

| Criterion | Evidence | Result |
| --- | --- | --- |
| Real source decoding and adaptive generation | Four real FFmpeg integration tests cover silent landscape, portrait with AAC, hash/poster refusal, HDR and oversized source refusal | pass locally |
| Generated media is decodable | Tests decode generated tiers and inspect portrait AAC/poster dimensions | pass locally |
| Public substitute while founder recordings are pending | MDN CC0 flower source processed, all three output tiers decoded again; retained aggregate receipt | pass locally |
| Durable adoption and cancellation fencing | Not implemented by this adapter | blocked |
| Pinned worker binary installation and hosted media checks | Local FFmpeg8.1.2 only; runtime image unchanged | blocked |
| Founder and physical-device acceptance | Pending founder samples and composed native pipeline | blocked |

Red checkpoint `75a7fa41` returned `VIDEO_PROCESSOR_INACTIVE` for the real decode outcome. Green implementation passes the four focused integration tests, worker TypeScript7/6 and changed-file lint. No simulator, Docker or deployed mutation ran.

Public fixture provenance: MDN `interactive-examples` commit `13024db581b08fae11a0ca229497198b9b0534e7`, [`live-examples/media/cc0-videos/flower.mp4`](https://github.com/mdn/interactive-examples/blob/13024db581b08fae11a0ca229497198b9b0534e7/live-examples/media/cc0-videos/flower.mp4), CC0. Source SHA-256 `0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451`. Source bytes and license remain under `/tmp/carberk-video-886`; no media bytes are committed. Source is5.055 seconds,960x540, H264/AAC. Output tiers are426x240,640x360,960x540; poster is640x480 JPEG. Exact output receipt is retained alongside this file. Codec/build differences may change output hashes, which are verification receipts rather than fixed reference encodes.

Docs: https://ffmpeg.org/ffmpeg-formats.html verifies HLS VOD, segment inventory and filename options. https://ffmpeg.org/ffmpeg-filters.html verifies scale envelope and crop behavior. Official pages were read for local FFmpeg8.1.2. No JavaScript dependency was added or upgraded.

## Durable schema prerequisite

Migration `20261015170000_video_processing_fences` adds nullable protocol/target/idempotency/completion fields to sessions, captured generation fence/source facts, a nullable Listing pending-generation pointer and separate durable processing/cleanup tables. Existing rows are not backfilled or authorized. Work tables intentionally have no cascading foreign keys so cleanup authority survives account/upload deletion. Work stores exact owned keys, multipart identity and bounded retry/lease fields, never credentials. Source/readback orchestration must populate/check these records before registration.

Exact schema SHA-256 is `2fdbb5ee35e6ad1c826ae110da7a2862f3c529fc7dad06d77ebc7b0fc84f7ec3`. SQL and retained fixture SHA-256 are `ff8a5579df352a389385aeb47f78caed985301995c569c3a5b21db2e022f779b`. Eight focused schema/retention tests and generated database-client build pass locally. Database URL was a localhost placeholder for generation; no database connection, migration execution or SQL concurrency acceptance is claimed. Hosted disposable PostgreSQL remains required. Forward recovery disables registration and retains additive fields and durable cleanup records.

## Publication orchestration checkpoint

`ProcessPreparedVideo` now runs actual source decoding/generation through the codec port, validates every generated playlist reference against the finite inventory, persists output intent before writing, reads back every object, and delegates final adoption to the durable ledger fence. Three real-FFmpeg workflow tests use database/storage boundary fakes and cover successful bytes, failed readback and cancellation after publication. They do not prove PostgreSQL locking, real object storage, account/business eligibility or final queue composition. Concrete ledger and storage integration remain required before registration.

`S3VideoProcessingObjects` supplies the concrete source/output transport in an explicit private bucket. Source download is streaming, bounded to the immutable expected length, hash-verified and written to a private scratch file. Output PUT is conditional create-only with SHA-256 checksum, and an existing object must match a full readback. Every readback streams bytes through a length bound and hash; it never trusts metadata as content proof. Two focused network-boundary tests pass. Actual provider conditional-write/checksum/timeout behavior is still a hosted/deployed acceptance gate, not established by these fakes.

## Binary packaging

The worker runtime Dockerfile now pins Debian Bookworm FFmpeg `7:5.1.9-0+deb12u1`, which also installs matching ffprobe. Both API test jobs pin Ubuntu24.04 and FFmpeg `7:6.1.1-3ubuntu5` so real codec integration tests run with a known hosted executable. Exact unavailable package versions fail installation rather than silently upgrading. Runtime5.1, CI6.1 and local8.1 output bytes may differ; tests assert media behavior and every generation retains its own hashes. A production processing version must identify the runtime package before adoption registration.

Docs: https://security.debian.org/debian-security/dists/bookworm-security/main/binary-amd64/Packages.xz verified runtime package/version and archive SHA-256 `2ba8ead87657c123ce6de2de5ecdbc1fb4ead9a4b317b85b8ec41e16c890fe01`. https://archive.ubuntu.com/ubuntu/dists/noble/universe/binary-amd64/Packages.xz verified CI package/version and archive SHA-256 `1a23baace5f2688a47e28119aedae6993cd638e6279a7227dfc52d9a337a1c17`. Noble updates/security universe indexes contained no replacement FFmpeg package when read. Existing package dependencies remain distribution-managed. No local Docker build or hosted workflow has run for this checkpoint; image startup and Linux codec acceptance remain required.
