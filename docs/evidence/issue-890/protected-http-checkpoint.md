# Protected video HTTP checkpoint

This checkpoint implements protected reads, not completed Listing video delivery or activation.

| Criterion | Implemented evidence | Remaining acceptance |
| --- | --- | --- |
| Grant bound to current account/session | Nullable owner columns, cascading foreign keys; `PrismaVideoPlayback` calls public Identity authority on every read; legacy null grants deny | Hosted PostgreSQL and real sign-out/deletion races |
| Canonical generation | Nullable Listing active generation plus revision; adapter requires exact READY/unretired matching generation | Adoption/replacement/removal writers must use revision CAS and revoke grants |
| Private HTTP | Real Fastify controller tests cover manifest rewrite, GET/HEAD, byte ranges, generic denial and no-store | Root DI, safe capability-path logging and deployed HTTPS/storage policy |
| Stream bounds | S3 readable stream, exact range/length response checks; local 16 concurrent request cap, 30-second lifetime; playlists limited to 512 KiB | Distributed stream/resource limits, timeout/load and cancellation evidence |
| Exact manifest | Strict `{assets:[{path,purpose,key,sizeBytes,contentType}]}` inventory; derived generation prefix, no raw source/public URL; HLS rewriting and purpose checks | Actual worker output/readback fixtures |
| Revocation | Every request rechecks grant deadline/revocation, current Identity session, tester eligibility, Listing visibility and active generation | Existing streams do not yet subscribe to revocation notifications |

`VideoPlaybackController` consumes `VIDEO_PLAYBACK_AUTHORITY` and `VIDEO_PLAYBACK_OBJECTS`. Bind them to `PrismaVideoPlayback` and `S3VideoPlaybackObjects`. The Prisma adapter requires `VIDEO_PLAYBACK_ELIGIBILITY`, which must use the current viewer tester rollout policy independently of upload admission. S3 needs an explicit verified private bucket and an owned configured client. Do not register routes until request/access/error logging scrubs capability URL paths and queries. No route returns a storage URL.

The grant issuer and processing/adoption pipelines are not provided by this checkpoint. Do not synthesize grant owner fields from viewer request bodies, infer active generation from timestamps, or treat helper metadata validation as transcoding. The serving controller is tested using boundary authority/object fakes. Prisma tests fake the database boundary and do not establish actual locking or foreign-key behavior.

Verification: 16 focused manifest, multipart, database-boundary authority, streaming-object and real HTTP tests pass. API TypeScript and changed-file lint pass. Red checkpoint `a8cb858b` demonstrated HEAD range returning 200 instead of required 206. Generated database client/build passes. Migration `20261015140000_video_playback_authority` and retained fixture SHA-256 are `019b9ea21c459d9e4e5df313f97957eba80a043ada053d8bd80fd13515b86eae`. The assembly owner must register the assembled schema hash and exact migration inventory in the retained profile because this worktree predates later reports migrations.

No simulator, deployed mutation, real telemetry or tester activation ran.
