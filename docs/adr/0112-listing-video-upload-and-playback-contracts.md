# ADR-0112: Listing video upload and playback contracts

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Carberk founder (contract choices delegated in #1040)
- **Complements**: ADR-0099; extends ADR-0079 and ADR-0088 ownership to multipart video generations

## Context

The current [#1038 prototype](https://github.com/Carberk/carberk/tree/prototype/listing-video) governs the tester slice. Photos permit publication independently of video; replacement keeps the current Ready video until its successor is usable. The API currently refuses video writes with `LISTING_VIDEO_UNAVAILABLE` and hides legacy video. #1037 proved direct multipart transfer, recovery, ranges and conditional writes against the unversioned Railway Bucket; completion must use server-listed part ETags. MinIO remains the photo store.

## Decision

Listings owns one optional video slot per Draft or Listing, uploads prepared sources through durable multipart sessions, and serves Ready generations through the existing API with authorization on every media request.

### Ownership and readiness

- A `ListingVideo` records its immutable owning User, exactly one current target (Draft or Listing), and separate nullable `activeGenerationId` and `pendingGenerationId`. A `VideoGeneration` records its video, source upload, processing attempt, status, selected cover offset, authoritative media metadata and exact asset manifest. These are distinct from catalog Generation and photo `ListingMedia` rows. Enforce one slot per target and one generation per source upload in the database.
- Server-recorded Media Upload provenance and exclusive adoption extend ADR-0079/0088: a source belongs to one User and can be adopted only by its bound video generation, never by a photo, Profile Photo or another target. A client key, duration, ETag or generation id confers no ownership. Record the Bucket provider and exact keys separately from MinIO photo cleanup.
- Opening a session reserves the pending generation; a second distinct pending selection conflicts until cancelled. Publishing atomically transfers the slot, active/pending generations and unfinished session from the owned Draft to the new Listing in the existing publication transaction. IDs, source keys and expiry do not change. A stale Draft request resolves only through that same owner's recorded adoption; it cannot retarget the video. Failed publication preserves the Draft video. Discarding the Draft retires its video. Required photos and their existing adoption rules remain independent.
- Generation states are Uploading, Processing, Failed, Ready and Retired. Preparing and pause reasons are phone state. Multipart completion means Processing, never Ready. Ready requires server validation and every declared cover, playlist and segment durably present. A Ready Draft stays private. Public reads expose only the active Ready generation; owner reads separately expose pending status, failure/retry reason and session identity. Unknown status remains unknown until reconciled.
- Promotion compares the pending generation and processing attempt under the target/video lock, rechecks target existence and eligibility, then switches active and clears pending atomically. The old active generation is retired in that transaction. A ban prevents promotion while the target is ineligible. Cancel pending leaves active untouched; Remove clears both. Removal, Listing deletion and account purge permanently invalidate pending attempts and enqueue cleanup in the same transaction. Duplicate/late jobs cannot restore a cleared pointer or promote a retired generation.

### Upload control contract (#1041)

Control calls use the existing authenticated API and check current owner, account/target eligibility and upload-tester membership. Unknown and foreign session/target IDs share an unavailable response. An idempotency key is scoped to User and operation; replay returns the same identity/result, while reuse with different input conflicts. Status exposes the canonical target, generation, state, expiry and confirmed parts; completion, cancellation and removal can be recovered after a lost response.

| Operation | Contract |
|---|---|
| Open | Own Draft/Listing, declared prepared byte count/type and cover offset; require `canUploadVideo`. Return session/generation IDs, fixed part layout and absolute expiry. Persist provenance and multipart identity before issuing transfer authority. |
| Status / renew | Server paginates Bucket `ListParts`; return confirmed part numbers/sizes and fresh URLs only for valid parts of this session. Client progress/ETags are hints. Renew never extends session expiry. |
| Complete | Serialize with cancel, expiry and target adoption; list parts again server-side, verify exact layout and total bytes, and use those authoritative ETags in sorted `CompleteMultipartUpload`. Persist completion intent before storage I/O; reconcile ambiguous success against the session's unique source object before retrying. Commit one adopted source and one durable processing handoff; retries return that same generation, including after the multipart ID disappears. |
| Cancel / expire | Terminal for an unfinished session; abort multipart, retire only its pending generation and persist retryable cleanup. Repeated calls return terminal status. A Completed session is not expired or cancelled by this operation: cancelling its pending processing is a generation operation; an active generation requires Remove. |

Sources are MP4, H.264 with AAC when audio exists (silent clips are valid), SDR, at most 30 fps, fitting 1280×720 or 720×1280, and at most 15 MiB. The selected interval is at most 90 seconds; the editor's minimum frame is 3 seconds, or the whole source when shorter. Cover selection is one of four candidates inside that interval; send its offset relative to the prepared clip, not the phone original. The worker validates the offset against actual duration. No original or client-made cover is uploaded as fallback.

The server chooses and records a valid part layout. Each presigned UploadPart URL authorizes only its recorded key/upload ID/part and required headers, for at most 10 minutes and never past `createdAt + 7 days`. The server verifies part lengths and actual completed size, not just declared metadata. URLs can expire without losing confirmed parts. Manual pause survives reopen; resume re-lists parts and retransmits only missing/mismatched parts from the same durable prepared file. Changing the prepared bytes requires a new session. Expiry is fixed, not sliding; after it no renewal/completion can adopt the source.

Completion and cancellation have one serialized outcome: cancellation/expiry winning prevents adoption; completion winning returns Completed and cancellation proceeds through pending-generation removal if requested. Uncertain in-flight completion must be settled before physical cleanup is marked done, including a source that appears late. Expiry never sweeps an adopted source. Persist the processing handoff with completion so a queue outage cannot strand a completed upload; consumers deduplicate by generation/attempt.

### Processing and retirement (#1056, #1042)

The worker inspects and decodes actual bytes within bounded time/memory before Ready; metadata supplied by the phone is not evidence. Generate authoritative photo-shaped covers and HLS VOD with H.264/AAC MPEG-TS segments, aspect-preserving 240p/360p/720p tiers without upscaling. Silent sources stay silent. Advertise only generated tiers, with aligned segment boundaries and truthful codec/bandwidth/resolution metadata. Every output belongs to the generation's recorded manifest.

Transport retry resumes the existing session. Processing Try again keeps the adopted source and allocates a new processing attempt/output namespace for the same pending generation; it does not ask the phone to prepare or upload again. Automatic retries are bounded. Invalid/missing source is a non-reprocessable failure requiring another selection. An old attempt can neither publish output into the new manifest nor mark the new attempt Failed/Ready.

Retirement is permanent and precedes physical deletion. Keep sources for attached active/pending generations, including reprocessable failures; no seven-day timer deletes them. Record durable cleanup for sources, all attempt covers/playlists/segments and multipart IDs, surviving deletion of User/Listing rows. Retry until abort/list verification and HEAD absence confirm the exact owned asset set is gone; never delete a live generation's source. Drain/reconcile in-flight multipart completion and object initialization before declaring cleanup finished. Initialize output keys once before granting an attempt write authority, then require conditional `If-Match` writes; missing deleted keys are never recreated. Revoked attempts cannot initialize new keys. Fail closed if conditional-write support or unversioned storage cannot be established. This extends ADR-0088's deletion fence to the whole video asset set without treating an unproven conditional multipart-completion operation as supported.

### Serving and rollout (#1043, #1049, #1057)

The Bucket stays private. API HTTPS routes proxy covers, master/media playlists and segments without redirects or Bucket GET URLs. A normal authenticated read can issue a cover grant; an authenticated playback request made only on Play issues the master-playlist grant. A signed bearer grant expires after five minutes and is scoped to User, current login Session, audience (viewer, owner preview or moderator), video and generation. It is a credential: redact grants from logs/telemetry and never put access/refresh tokens in media URLs.

Every GET/HEAD, including ranges, checks the grant signature/expiry and current Session/account, then current target visibility, view-tester membership and the active Ready generation against authoritative state. No cache hit or 304 bypasses those checks. Removed/replaced generations and banned/deleted/archived Listings refuse new viewer requests immediately after the state change commits. The owner-preview audience instead requires current ownership of a non-retired Ready generation on the owned target. The moderator audience requires current Admin permission on each request, permits inspection of a retained Ready generation on a banned/archived Listing, and never grants access to removed/retired/purged assets. It cannot be used on viewer routes. Playback already delivered/buffered cannot be recalled.

Rewrite **every** playlist resource URI to an absolute same-API URL carrying the grant explicitly, including variant playlists and segments; query parameters are not inherited by HLS child requests. Accept only manifest members, never caller-supplied storage keys. Covers are `image/webp`, playlists `application/vnd.apple.mpegurl`, segments `video/mp2t`; send `Cache-Control: private, no-store` on successes and refusals. Proxy binary byte ranges with correct 206/416, `Accept-Ranges`, `Content-Range`, length and ETag. No shared delivery cache or persistent player/image cache may bypass authorization. Expired grants are renewed through authenticated control calls after rechecking access; the player reloads with the new grant and restores position if still allowed.

SDK compatibility is documented, not claimed as runtime proof: main has Expo 55.0.32 and no installed playback package; its bundled module map selects `expo-video ~55.0.21`. SDK 55 documents HLS sources on iOS/Android, and Apple's HLS and Android Media3 docs support H.264/AAC transport-stream delivery. The native player adapter must load the explicit grant URLs and preserve range/response semantics; this contract assumes neither inherited cookies nor automatic header propagation. #1046/#1050 must still prove authenticated playback, expiry/reload, seeking/ranges and revocation on native players. #1039's native preparation module is a separate boundary; this contract imports no unmerged code.

API config holds independent upload/view User-ID lists, empty by default, and `LISTING_VIDEO_UPLOADS_ENABLED=false`. `canUploadVideo` requires the upload list, switch and current account eligibility. The switch blocks new sessions/picks; existing eligible sessions may resume/complete and stored sources may reprocess. View access depends on the view list, independently of upload membership or switch. No Admin gate UI, Results badge or With-video filter is introduced.

Keep the current hold until each new path is implemented behind these defaults. #1041 removes the single-PUT video implementation; old presign/attach video requests continue to fail with `LISTING_VIDEO_UNAVAILABLE`, never silently selecting the photo path. New video controls use session/generation IDs. #1043 adds optional Ready-video metadata beside unchanged photo contracts, keeps the photo cover first/video second and never promotes legacy video rows. #1057 must gate every file before tester activation. This ADR alone enables nothing; legacy public URLs require separate remediation and gain no revocation guarantee here.

## Consequences

### Positive

- Backend tickets share ownership, retry and revocation semantics while photos remain independently publishable.
- API authorization is enforceable for every new media request without native header-propagation assumptions.

### Negative / accepted costs

- Proxying media consumes API bandwidth; URL-grant redaction, bounded processing and durable reconciliation/cleanup are required.
- Buffered bytes survive revocation; grant expiry can require a player reload. Native proof and founder samples remain release gates.

### Neutral

- No endpoints, schema migrations, worker implementation, provisioning or tester activation are delivered by this decision.
- Existing photo ownership/storage and merged ADR text remain unchanged.

## Alternatives considered

- **Presigned Bucket playback URLs** — cannot recheck current Ready generation, visibility and view eligibility on each request after issuance.
- **Bearer headers/cookies inherited through HLS** — propagation is not established by the installed API; explicit resource grants avoid that dependency.
- **Replacing public media before Ready / uploading again on processing failure** — contradicts the approved replacement and Try again flows.

## References

- [#1040](https://github.com/Carberk/carberk/issues/1040), [parent #1038](https://github.com/Carberk/carberk/issues/1038), [Bucket proof #1037 / PR #1065](https://github.com/Carberk/carberk/pull/1065)
- [ADR-0099](0099-tester-only-listing-video-with-a-90-second-limit.md), [ADR-0079](0079-server-recorded-upload-provenance-for-listing-media.md), [ADR-0088](0088-exclusive-upload-adoption-and-retirement.md), [ADR-0089](0089-transient-publish-failure-releases-photos.md)
- [Listing video UI](../prd/ui/hifi/mobile-listing-video.md) (current prototype wins where they differ)
- [Expo SDK 55 VideoSource](https://docs.expo.dev/versions/v55.0.0/sdk/video/#videosource), [Apple HLS authoring](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html), [Android Media3 HLS](https://developer.android.com/media/media3/exoplayer/hls) (checked 2026-11-06)
