# Video upload/serving proof #889

Campaign #897, supplied base `c5d055b5b68811adc22c87dbb24430cd8fc17ad1`, isolated writer `agent/issue-889`. [V1 decision contract](video-protocol-v1.md) owns the implementation-ready session, storage, readiness and serving design. Source/execution remain separate from that design. No production routes, database/schema/shared-contract edits, paid/live provider operations, rollout activation or simulator boots ran.

| Criterion | Evidence | Result |
|---|---|---|
| Authenticated resumable session, confirmed parts/renewal, idempotency,7day expiry/cancel | V1 contract; executable proof tests incl storage-boundary fake, lost-response/recreated-state and cancel/late-complete race | pass for bounded design/model; hosted actual MinIO proof pending CI |
| Every manifest/segment/poster access respects visibility/generation/grant | V1 purpose-bound no-store gateway; real loopback HTTP nested-resource/revocation test; native network feasibility below | pass for bounded mechanism; mobile/HTTPS/deployed gates remain |
| Durable readiness, poster time, generation/adoption/retirement | V1 state/migration/work plan; readiness refuses missing assets/invalid authoritative poster timestamp/stale pending/remove fence | pass for design/model; actual DB/worker races belong #890/#891 |
| Open media compatibility, versioning/migration/worker requirements | Overlap inventory below and V1 delivery order | pass |

## Red and green

Pushed red `53c6ce96` before production implementation. `node --test scripts/video-protocol-proof.test.mjs` exposed7behavior failures against inert completion/authorization/readiness/manifest functions. The green suite has9 passing cases after adding unique-object lost completion reconciliation and actual HTTP nested HLS/revocation. It never imports application endpoints or mutates rollout state.

The protocol class is an isolated executable design model with storage-boundary fake, not a replacement for PostgreSQL row locks, durable outbox or production ownership validation. Tests do not establish multi-process transaction correctness, actual in-flight S3 abort races or provider power-loss durability. Those are explicit downstream hosted gates, not assertions hidden behind an in-memory model.

Local checks: root suite247pass/1hosted-storage skip; API209files/2077tests pass/2existing skips; API TS7+TS6 and zero-warning lint pass. Dedicated hosted API wrapper is collected/skipped locally. Actual MinIO proof requires GITHUB_ACTIONS=true and disposable loopback MINIO_ENDPOINT. It creates/deletes one unique private scratch bucket, verifies unversioned state, performs real presigned multipart PUTs, ListParts recovery, expired-signature refusal and renewed final-part credentials, anonymous-read denial, completion/unique-object replay, exact byte readback, object absence and separate unfinished abort/ListMultipartUploads absence. It has NOT run locally. API CI lane starts the owned disposable MinIO and executes it through `VideoProtocolProof.e2e.spec.ts`; frontend root lane safely skips it without services. No local Docker or live MinIO endpoint was used.

## Actual native authorization feasibility

Built `scripts/video-protocol-native-proof.swift` with installed macOS AVFoundation and ran it through `scripts/video-protocol-native-proof.mjs` against the fixture-only loopback gateway. Actual AVPlayer requested the grant-namespaced HLS master, media playlist and TS segment and decoded a video pixel buffer. [Receipt](native-gateway-receipt.json):3manifest requests,1segment request, decodedFrame=true/processExit0; after Listing visibility removal a fresh manifest request returned404. The HTTP test separately proves fresh segment404 after revocation. No inherited Authorization headers or unauthenticated storage redirect were needed. Byte responses use private,no-store; gateway streams segments with backpressure.

This is desktop AVFoundation, not Expo iOS/Android acceptance. It proves ordinary URL/grant-namespace native network feasibility and independent server revocation. It does NOT prove native cancellation on ban, HTTPS deployment, seek/range handling, source replacement, player caching/expiry renewal, Android requests or startup targets. No new simulator boot was needed. Existing #888 Android emulator boot failures and physical HDR/provider/resource limitations remain in [#888 evidence](../issue-888/verification.md).

Fixture was the permissioned CC0 MDN flower clip, previously generated local HLS240p bytes from `/tmp/carberk-video-886/hls`; no new source fetch or repeated desktop conversion. Reproduce by placing master.m3u8 plus its same-directory media playlist/segments in an owned fixture directory, compiling Swift with `xcrun swiftc -parse-as-library scripts/video-protocol-native-proof.swift -o /tmp/native-gateway-proof`, then running `node scripts/video-protocol-native-proof.mjs FIXTURE_DIRECTORY /tmp/native-gateway-proof /tmp/receipt.json`. Receipt contains only aggregate requests, no bearer URLs. The proof gateway allows only named media extensions and is not a production server.

## Compatibility and overlap inspected

Bounded GitHub snapshot included #886 and child #888–#896; #890/#891/#892 bodies establish downstream boundaries. Separate open upload work inspected:

- #750 owns existing upload-claim release/settle/reserve race coverage and publish retry evidence. New video adoption must use the common lifecycle fence; this proof neither closes nor bypasses that gap.
- #770 owns a known retired-upload overlapping-sweep batch test failure. Video cleanup must have its own bounded manifest handler and race tests, preserving existing photo sweep behavior. This proof does not claim that flake fixed.
- #758 owns existing Profile Photo unreadable-source/retry/progress native defects. New video native lifecycle must avoid repeating them; no profile picker fix is bundled.
- #624 owns existing Listing draft presentation/photo retry evidence. Keep old photo publication/retry intact. No photo UI change belongs here.
- #903 owns private service/inspection artifacts and #908 business Listing actor authority. A service/report grant is not a video viewer grant. Business upload must use the authoritative Listing actor adapter, not broaden User/key authorization ad hoc. Their later contracts can consume V1 without sharing storage URLs or accepting raw keys.

Current `MediaStoragePort` has only single PUT/publicURL/delete, with `.mp4/.mov` extension bucket inference. Current `video-transcode` worker throws UnrecoverableError because unsupported; broad orphan cleanup is also unsupported. Current retirement handles fenced image manifests. These facts require a separate explicit video multipart/read port, versioned migration/contracts, process/cleanup worker and readiness gates; they do not establish shipped video support.

No existing attempt/branch/worktree for #889 was found before reservation. PR904 is the single campaign integration PR; no competing issue PR opened. #900 schema ownership was respected throughout.

## Required downstream gates

#890 owns actual schema/contracts/auth/session/CAS/outbox/storage races and private provider/versioning proofs; #891 actual bounded codec/poster/rendition/full-manifest generation, replacement/removal/account-purge cleanup and real DB/storage races. #892/#895 own current visibility/moderator-purpose integration, HTTPS streaming, native source/quality/renewal/intent/no-prefetch and real app checks. #896 owns resource/egress/cap budgets and explicit tester activation. Collection and all tester capabilities remain closed. No general public playback or raw source URL is authorized. Hosted integration CI, independent campaign review and final deployed/native acceptance remain required.

Docs: the preceding selected-plan research is reused, not restarted. https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html —5MiB part minimum except last; https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html —complete may carry error in HTTP200; https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html —late in-flight parts/absence reconciliation. Installed AWS SDK3.1048.0 commands/types and presigner verify executable shape. https://docs.expo.dev/versions/v55.0.0/sdk/video/ and pinned Expo native source41d102b63d400b42cc0286aaf554a9dd022d428c explain why no iOS nested-header guarantee is assumed. No dependency upgrade or external service selected.
