# Prepared byte processing checkpoint

The local `FFmpegVideoProcessor` processes real files into HLS and a cropped JPEG poster. It does not download source objects, upload/read back generated objects, persist durable work or mark a generation READY. The registered video queue still rejects work. The worker image still lacks FFmpeg; production activation remains closed.

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
