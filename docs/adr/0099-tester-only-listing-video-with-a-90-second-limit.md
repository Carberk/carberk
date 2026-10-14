# ADR-0099: Tester-only Listing video with a 90-second limit

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Supersedes**: ADR-0008 for Listing video duration, preparation, delivery and lifecycle only; ADR-0027 for the selected tester-only Listing video scope only

## Context

The founder agreed the Listing video specification in issue #886 on 2026-10-14. Sellers need a short walkaround, interior view and engine sound. Large phone originals make upload preparation necessary even when playback streams are small. ADR-0008 specifies a 60-second video pipeline; ADR-0027 defers video beyond the MLP beta. The agreed tester experiment changes those decisions within a bounded scope.

## Decision

Carberk implements one optional active Listing video of at most 90 seconds for an explicitly controlled tester rollout, following issue #886 and the canonical Listings specification. With all other existing publication gates satisfied, required photos permit publication while optional video is pending or failed.

Sellers select a library video, preview and trim one interval, and choose a poster. The phone prepares only that interval into a durable staged H.264/AAC file, at most 30 fps and within the applicable 720p envelope, preserving complete frame, aspect ratio and orientation. It uploads the prepared clip directly to owned S3-compatible storage with durable resumable-upload authority. The full phone original is never uploaded. The proposed 10-minute/2-GiB selectable-source limits and 15-MiB prepared cap remain technical-proof assumptions under #886, not proven operating limits.

Self-hosted server processing validates actual media, generates available adaptive 240p/360p/720p renditions without upscaling and authoritative posters, and exposes readiness only when the required assets are usable. Playback begins only after Play. The serving path must enforce Listing visibility for new access; immutable public video object URLs alone are insufficient. Existing photo serving and contracts are outside this supersession.

Listings owns adoption, replacement, removal and retention. Ownership, exclusive adoption, durable retries and cleanup extend to the complete video asset set. Replacement preserves the old ready video until an atomic ready replacement. Late jobs cannot revive removed media. Incomplete sessions recover for seven days and then expire; attached sources remain available for reprocessing.

No external video provider, in-app recording, chat video, video feed, autoplay, offline-playback promise or persistent offline download is selected. Wider rollout, production promotion and paid resources remain separate decisions. Upload and viewing eligibility must be settled before activation; rollout stays disabled until then.

This records the founder-agreed product direction. It does not select an unproven native library, concrete upload protocol or authenticated serving implementation, certify HDR/HEVC support, authorize new external egress, or establish implementation completion.

## Consequences

### Positive

- Sellers can show a useful walkaround while buyers control playback and data use.
- Phone preparation avoids sending huge originals on slow uploads.
- Existing photo publication remains usable during optional video failure.
- Self-hosting preserves future TM deployment constraints.

### Negative / accepted costs

- Native preparation, durable recovery, authenticated stream delivery and complete asset cleanup need technical proof and meaningful integration evidence.
- Processing requires bounded CPU, memory, queue capacity, storage and egress budgets before tester activation.
- Founder recordings and final native acceptance remain required. Public clips and synthetic fixtures cannot establish physical-phone compatibility or native HDR fidelity.

### Neutral

- All unrelated ADR-0008 and ADR-0027 decisions remain effective. Historical ADR files are unchanged.
- Existing photo provenance/adoption guarantees and supported older clients remain compatible.
- No sprint, general release date or wider feature campaign scope is created by this decision.

## Alternatives considered

- Keep the 60-second limit and video deferral: does not reflect the founder-agreed #886 scope.
- Upload full originals and compress only on the server: does not address the large-original upload problem.
- Adopt an external video service: excluded by the agreed self-hosting constraints.
- Block publication until video finishes: conflicts with optional video and photo-based publication.

## References

- https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/886
- [ADR-0008](0008-media.md)
- [ADR-0027](0027-mlp-beta-scope.md)
- [ADR-0039](0039-phased-cloud-first-hosting.md)
- [ADR-0079](0079-server-recorded-upload-provenance-for-listing-media.md)
- [ADR-0088](0088-exclusive-upload-adoption-and-retirement.md)
- [ADR-0098](0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md)
- [Listings specification](../prd/features/32-listings.md)
