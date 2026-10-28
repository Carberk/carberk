# Current exclusion experiment contract

Prepared under the accepted independent report `/tmp/candidate-a-reset-exclusion-contract-review.md`. This file records future literal operations for a coordinator-reserved window, not commands run by this writer. Test-only checkpoint `6972c244` precedes implementation. Source-only scheduling remains effective until the parent releases runtime. The old history-based observer stays closed.

## Fixed identity and experiment input

Project `176ddec0-dd65-4087-b82c-798599fc2ebe`, staging environment `652abc79-fdb0-48b0-9f6c-ad0ff572d7b2`. Application services are API `6db6f1b1-5c7a-4033-88d0-53f5f315bfc0`, worker `24aa02e0-25a9-4e80-9cc2-c1795ef82091`, admin `69ba9f86-0000-4460-8165-de69b289b36e`, web `f3c5888b-d303-44b1-bc6e-3d775dad4639`. MinIO service `af9ecdec-433b-48f0-8457-1a13c5ab1ab7` must retain service, image/configuration, volumes/mounts, domains, credentials, policies and lifecycle. No unreviewed helper service or public data endpoint is selected.

Before any mutation, the existing authenticated CLI adapter must attest the exact owner/reservation/candidate and all origins. Record a redacted baseline of original per-region replica maps, restart policy, cron/wake/source/deployment configuration, every active/pending deployment and instance/container/boot identity, storage epochs and protected configuration digests. Capture raw variable values only inside the credential-owning process; report required nonsecret configuration or hashes. CLI authentication does not authorize an unreserved experiment.

The baseline and each effect intent belong in the existing Git lease operation, with its expected-old-ref CAS. A failed/ambiguous CAS authorizes no effect. The operation identity and closure generation survive coordinator reconstruction. A fresh operation cannot adopt partial effects.

## Provider and executor experiment

Installed CLI 5.71.0 help already established these explicit-target command forms. Region names and deployment IDs below must come from fresh authoritative baseline, never assumptions or caller proof.

```sh
railway status --project 176ddec0-dd65-4087-b82c-798599fc2ebe --environment 652abc79-fdb0-48b0-9f6c-ad0ff572d7b2 --json
railway scale --project 176ddec0-dd65-4087-b82c-798599fc2ebe --environment 652abc79-fdb0-48b0-9f6c-ad0ff572d7b2 --service 24aa02e0-25a9-4e80-9cc2-c1795ef82091 eu-west=0 --json
```

The second line illustrates a single observed region. The executor must supply **every actual configured region** and each application service, including API, admin and web, after persisting exact intent. Do not run this illustrative map as though it were complete.

The inspected public schema supports exact deployment-stop/restart operations through the CLI session:

```graphql
mutation stopExact($id: String!) { deploymentStop(id: $id) }
mutation restartExact($id: String!) { deploymentRestart(id: $id) }
```

Use `railway api --file /tmp/<owned-operation-file>.graphql --variables @/tmp/<owned-validated-identities>.json --compact`. The fixed documents and credential-free IDs must be written by the controller, not an arbitrary user-supplied GraphQL executor. Stop every recorded active/pending application execution and inspect provider/runtime death evidence after a deliberately lost reply. Exercise an already admitted rollout and pending crash restart. Desired zero must suppress ordinary crash, queued rollout, cron and wake paths. A deliberately authorized administrator override is separately labelled a reservation breach. Re-read desired configuration and every instance through the closed interval; two equal snapshots are consistency checks, not the provider qualification itself.

The selected SSH host is an exact candidate API deployment admitted only to the maintenance-before-Nest entrypoint. Its transition is journaled separately from business desired-zero. `STAGING_CLEAN_RESET_EXECUTOR` contains only exact operation/reservation/candidate/closure/project/environment/API service identifiers. Invalid/missing target binding with that mode selected must fail startup, never fall through to normal business boot. Business module imports must occur only after the maintenance branch, since static `AppModule` imports can execute registration code before Nest construction. The maintenance server exposes only existing health/readiness and refuses business and operator routes. No public reset endpoint is added.

The host's automatic restart must run that same admitted artifact and environment snapshot, without Nest, consumers, schedulers or business child processes. Required receipt identities include deployment, instance/container and boot epoch, exact artifact/start-command/environment-snapshot digests and child-process inventory. After a controlled automatic host restart, run only the fixed operator observation over exact-instance SSH:

```sh
railway ssh --project 176ddec0-dd65-4087-b82c-798599fc2ebe --environment 652abc79-fdb0-48b0-9f6c-ad0ff572d7b2 --service 6db6f1b1-5c7a-4033-88d0-53f5f315bfc0 --deployment-instance EXACT_ADMITTED_INSTANCE -- node -e FIXED_REVIEWED_PROGRAM
```

That is a transport shape only. The production adapter must construct the fixed reviewed program; no arbitrary Node or shell payload is admitted. A new normal API/worker execution blocks the next phase immediately. If the provider cannot qualify this host, do not relax fixed remote identity guards or expose databases; retain the named missing non-business data transport.

## Storage lifetime, trusted time and accepted-request drain

The installed MinIO identity is `RELEASE.2026-09-22T19-25-18Z`, commit `df34868a88cc8c396807e04a7e220810b321bdaa`. Its V4 parser's seven-day duration limit is not an outstanding-grant bound. SigV2 absolute expiries and future-dated V4 signatures require actual issuance-family/configuration authority. Inspect existing authenticated configuration and approved artifact/clock chains without exporting credentials. If no finite applicable horizon is established, keep closure and name that precise evidence gap. No policy or credential change is implied.

On a coordinator-assigned disposable exact-version runtime, prove long V2 acceptance/restriction, above-limit V4 rejection and future-date behavior using controlled clocks. Then reconcile those storage semantics with actual target issuance authority. The protocol requires strict greater-than expiry after bounded clock error, continuous trusted elapsed time tied to an external epoch, and contemporaneous storage time. Coordinator restart does not reconstruct a missing monotonic interval from wall timestamps.

Hold ordinary authenticated PUT, UploadPart and CompleteMultipart work across expiry, through both public proxy buffering and direct private connections. Journal the old MinIO epochs and restart intent, terminate every old accepting process on the same service/volume, and verify old sockets cannot commit after expiry. A healthy new process is insufficient while any old epoch survives. A lost restart reply is reconciled from old/new process identity. Signature rejection on the new epoch is separately established from the actual horizon. An already completed write must be found by exhaustive inventory.

No storage mutation call is prepared from a guessed stop/drain semantic. The same-service restart uses the inspected exact deployment API only after the parent authorizes its protected baseline and experiment. Restore the original replica/restart/cron/maintenance configuration and verify its redacted digest after the experiment, even on interruption. Never delete a bucket, service, volume, project, signing identity or credential.

## Storage collection and recovery acceptance

Resolve all eight logical families using both API and worker configuration: public photos/videos/chat/catalog; business-chat-private; service-private; configured video-private; configured diagnostic-private. Deduplicate actual physical identities and reconcile the complete bucket inventory plus each reachable endpoint. Explicit unbound buckets survive; unknown application scope blocks completion.

Use actual `ListObjectVersions` and `ListMultipartUploads` page markers to terminal pages. A missing/nonadvancing/repeated continuation, omitted/ambiguous version ID, unknown prefix or resource bound refuses. Treat the explicit `"null"` version as an exact version identity. Approved artwork requires exact bucket/key/version membership and SHA-256 of version-specific bytes. Equal ETag/size is insufficient.

Persist immutable plan/binding/reference intent before any abort/delete. On loss, re-collect under the same closure and compare remaining state as an exact subset of that plan, with preserved references unchanged. New versions/uploads or changed metadata refuse, rather than enlarge the plan. Inspect per-item errors in HTTP200 delete responses. Abort exact upload IDs, delete exact version IDs and require repeated exhaustive inventory to equal only the preserved identities. Completion replay is observation only. Changed owner/target/candidate/generation or ambiguous CAS must stop before any next effect.

## Parent-owned row dependency and release

Rows remain blocked on the sole DB owner's lawful reset/abandonment protocol, preserving current public migrations/functions/guards and reference/configuration. The required contract atomically compares schema/content and immutable closure binding, disposes exact authorized scenario inventory including classified obsolete campaign controls, and records an immutable current-operation receipt with lost-reply recovery. No TRUNCATE guard removal, trigger disable, CASCADE or product-erasure claim is selected.

After approved reference reconstruction and ordinary auth/readiness, verify a full-horizon late-object re-inventory, zero stale jobs/delivery, and latest-main restoration before release. Existing row/Redis recovery stays intact. Every runtime command, actual outcome, protected baseline comparison and cleanup result belongs in the final exact-candidate receipt. Source tests and this experiment plan do not activate staging or production reset. Fresh assembled Standards/Spec review and CI remain required.
