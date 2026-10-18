# Media Upload SQL guard audit

Hosted55066c85 rejected real V1 source insertion on conditional_manifest_check.250000 admits only exact source-key singleton video-v1 manifests. Hosted5eb0aa7d then rejected insertion on write_protocol_check, before processing behavior could be tested.260000 adds video-v1 to the closed protocol enum. These are production defects reproduced by actual PostgreSQL, not valid processing no-op red evidence.

All media_uploads constraint definitions and later alterations were read across migration history. The remaining guards are state_check, accepting the existing PREPARING/ADOPTED/RETIRED/DELETED states, preparation_check requiring token/deadline during PREPARING, claim_target_check now permitting only the matching PREPARING video_session token or ordinary listing/profile adopter, source inventory guard from250000, unique key/id, user foreign key and additive business ownership foreign key. V1 keeps those invariants. Video source adoption becomes an ordinary listing claim with token/deadline cleared. Cleanup work is independent and never widens image manifests or permits unknown protocols.

The next hosted run must first prove fixture insertion succeeds, then record the four desired missing-processing assertion failures. No local PostgreSQL run is claimed.
