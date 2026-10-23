# B2/B3/B4 source coverage disposition

Implementation checkpoint from parent local base `ded5474ff979b1b7281af631e488aaba2e6bdc7f`, base tree `4c939c883553004a1bb94e3d91156a59d4ce1420`. Published PR904 remains `0ca85a6276286278b49333cfa25e0cc99cd93166`. This checkpoint changes tests and mutable coverage guidance only. It is not hosted product GREEN or operator acceptance.

The founder orders API/worker GREEN before deployed reset. The narrow amendment to [the clean acceptance contract](../issue-901/prelaunch-clean-acceptance-contract-20261021.md#1-non-inference-rules) permits equivalent source-test replacement before operator acceptance. Exact-candidate inventory, quiescence, reference reconstruction, reset/reseed, restart, late-object verification and restoration still block deployed/native acceptance and release. No ADR, production/reset code, permission, migration, deadline or ownership protocol changes.

## Replacement boundaries

- B2 stays at the real SQL boundary inside `CampaignFullV3.e2e.spec.ts`, reusing its ordinary authenticated Support fixture, real `ExpireServiceContent`, `CampaignSupportRetention` and installed production `campaign_support_lifecycle_authority`. The child only pauses after its unchanged real selection and before the per-case transaction. The absent-target case executes existing fixture disposal before resuming. The present-target negative fixture changes only the test namespace manifest to terminal state while retaining the exact graph/journal. It also sets `object_hash` to the generated hash of the empty `campaign_object_ledger`; the generated object inventory validates that hash before the lifecycle authority can return false. The fixture restores `state='identities', object_hash=NULL` for ordinary teardown. No trigger, authority SQL, permission or product callback is replaced. No SQL function, trigger, permission or purge callback is replaced. Real authority must refuse with private messages, epochs, audits and foreign state unchanged, including a repeat sweep and zero storage requests. The neighboring two-due-namespace positive control remains unchanged and requires actual admitted purge. This is SQL test implementation, not executed SQL evidence.
- B3/B4 retain authenticated HTTP publish/attach, real PREPARING claims and target identity, production claim recovery, lost-claim HTTP refusal, persisted non-publication/non-attachment and foreign business/object checks. The S3 boundary pauses before dispatch only until recovery, with an explicit unexpired-signal assertion under the unchanged 10-second request budget. No exact reset runs while the request is held. Attach retains the exact recovery deadline, outage, 60-second backoff and retry-to-DONE assertions because NP-4 alone does not assert all of them.
- Existing `ServiceLifecycle.e2e.spec.ts` 8/8 and `CleanRetiredUploads.e2e.spec.ts` 23/23 are reused unchanged. NP-4 publish at base line 470 and attach at 505 own real streamed PUT/cleanup ordering. The generation-versus-retirement case at 443 owns direct 404/409/412 late-byte refusal after deletion. NP-4's shared oracle verifies written-then-deleted bytes, exact DONE state, intact foreign stock and a storage-free late sweep. No duplicate NP-4 race was added.
- The unchanged ordinary conditional business-media case at base line 2717 retains presign headers, successful PUT, publish/attach, foreign-key rejection, nonmember 403s, membership removal and state preservation. Account erasure, inclusive retention, reopen/HTTP races, private bytes and audit redaction tests remain intact. Existing lost-receipt/reset retry cases are unchanged; this batch removes only their duplicate historical-reservation assertions from these tails.

## Assertion inventory

Every assertion-bearing line in the old three cases is listed below against the exact parent base. B3 and B4 share the parameterized body; each entry applies independently to both modes unless its branch says otherwise. `expect.any` placeholders belong to the enclosing assertion. The original source remains available through the base commit. HTTP `.expect(...)` assertions are included.

Disposition keys:

- **K**: retained in the rewritten HTTP test with its original expected value.
- **S**: retained setup/cleanup assertion; it establishes fixture safety, not a product pass.
- **B2**: replaced by the two real-SQL selected-worker cases described above.
- **NP4**: product byte/foreign-stock obligation reused from the unchanged direct worker suite; same-candidate hosted execution remains required.
- **R**: disposable reservation/history or old scheduling premise removed under founder authority. Operational reset acceptance remains mandatory separately.

| Old line | Assertion | Disposition |
|---|---|---|
| 2295 | expect(await gateAcquisition).toBeUndefined(); | R: test-only advisory gate acquisition. |
| 2303 | expect(reset.error).toBeUndefined(); expect(reset.value?.code).toBe(0); | R: reset transport success during old lock ordering; new absent case still asserts successful fixture disposal. |
| 2306 | expect(terminal.events.slice(0, 82)).toEqual(live.events); | R: historical event-prefix preservation. |
| 2308 | expect(await run.result).toEqual(supportRaceEmpty); | B2: selected worker does no purge or cleanup. |
| 2309 | expect(storage.counts()).toEqual({ requests: 0, forwardingFailures: 0 }); | B2: zero private storage I/O. |
| 2310 | expect(await supportRaceSnapshot(primary.id)).toEqual(terminalSnapshot); | B2: no terminal-state writes. |
| 2311 | expect(await supportRaceSnapshot(foreignId)).toEqual(foreignBefore); | B2: foreign tenant persisted state unchanged. |
| 2313 | expect(await late.result).toEqual(supportRaceEmpty); | B2: late worker remains a no-op. |
| 2314 | expect(storage.counts()).toEqual({ requests: 0, forwardingFailures: 0 }); | B2: repeated zero storage I/O. |
| 2315 | expect(await supportRaceSnapshot(primary.id)).toEqual(terminalSnapshot); | B2: repeated target state preservation. |
| 2316 | expect(execute("reset", primary.id)).toMatchObject({ code: 0, receipt: supportRaceReceipt }); | R: duplicate reservation reset receipt/retry. |
| 2317 | expect(await supportRaceSnapshot(primary.id)).toEqual(terminalSnapshot); | B2: repeat worker target preservation; reset retry history retired. |
| 2318 | expect(await supportRaceSnapshot(foreignId)).toEqual(foreignBefore); | B2: repeated foreign state preservation. |
| 2320 | expect(execute("reset", foreignId)).toMatchObject({ code: 0, receipt: supportRaceReceipt }); | R: control reservation disposal receipt. |
| 3012 | expect(await rows(\`SELECT (SELECT count(*)::int FROM "cf_${reservation}".campaign_records) AS records,(SELECT count(*)::int FROM "cf_${reservation}".campaign_events) AS events\`)).toEqual([{ records, events }]); | S: retained fixture journal accounting. |
| 3013 | expect(records).toBeLessThanOrEqual(128); | S: retained fixture record guard. |
| 3014 | expect(events).toBeLessThan(2048); | S: retained fixture event guard. |
| 3077 | expect(process.env["GITHUB_ACTIONS"], "SETUP: hosted disposable services only").toBe("true"); | S: retained hosted-only execution guard. |
| 3078 | expect(loopback(endpoint) && loopback(publicUrl), "SETUP: lane-local disposable MinIO required").toBe(true); | S: retained lane-local storage guard. |
| 3081 | expect(await db.brand.findMany({ where: { OR: [{ id: catalog.brandId }, { slug: catalog.brandSlug }] } })).toEqual([]); | S: retained catalog collision guard. |
| 3082 | expect(await db.model.findMany({ where: { OR: [{ id: catalog.modelId }, { slug: catalog.modelSlug }] } })).toEqual([]); | S: retained catalog collision guard. |
| 3083 | expect(await db.region.findMany({ where: { OR: [{ id: catalog.regionId }, { slug: catalog.regionSlug }] } })).toEqual([]); | S: retained catalog collision guard. |
| 3084 | expect(await db.city.findMany({ where: { OR: [{ id: catalog.cityId }, { slug: catalog.citySlug }] } })).toEqual([]); | S: retained catalog collision guard. |
| 3095 | expect(signed.status, "ordinary recorded conditional presign").toBe(201); | K: conditional presign HTTP 201. |
| 3097 | expect(await owned(reservation)).toContainEqual({ table_name: "media_uploads", row_key: { id: row.id } }); | S: exact fixture-owned upload. |
| 3098 | expect(row).toMatchObject({ userId: owner.user.id, businessId, state: "AVAILABLE", writeProtocol: "conditional-v1", objectKeys: manifest(key) }); | K: owner/business/AVAILABLE/protocol/manifest readback. |
| 3099 | expect(signed.body.headers).toMatchObject({ "if-match": expect.any(String), "content-type": "image/webp" }); | K: If-Match and content-type headers. |
| 3100 | for (const member of manifest(key)) expect(await head(member)).toBe(200); | K: initialized manifest present. |
| 3101 | expect((await fetch(signed.body.uploadUrl as string, { method: "PUT", headers: signed.body.headers as Record<string, string>, body: new Uint8Array(image) })).status).toBe(200); | K: ordinary signed conditional PUT 200. |
| 3105 | expect(await rows(\`SELECT to_regclass('"cf_${reservation}".campaign_manifest')::text AS present\`)).toEqual([{ present: null }]); | S: unused reservation guard. |
| 3113 | const admitted = (await post("/api/v1/business/admission", staff.staff, admissionFor(reservation, owner.user.id)).expect(201)).body as { businessId: string; token: string }; | K: authenticated admission 201. |
| 3116 | await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201); | K: invitation redemption 201. |
| 3122 | expect(issued.status, "SETUP: ordinary contact request").toBe(200); | K: ordinary contact request 200. |
| 3126 | expect(code, "SETUP: protected contact sink").toBeDefined(); | S: protected sink delivery. |
| 3127 | await business(post("/api/v1/me/contact-phones/verify", owner, { phone, code }), businessId).expect(200); | K: contact verification 200. |
| 3139 | const draft = (await post("/api/v1/listings/drafts", owner, { businessId, initialPayload: payload(photos, phone) }).expect(201)).body as { id: string }; | K: ordinary draft creation 201. |
| 3141 | listingId = ((await business(post(\`/api/v1/listings/drafts/${draft.id}/publish\`, owner, {}), businessId).expect(201)).body as { id: string }).id; | K: ordinary publish 201. |
| 3151 | expect(object.Body, \`foreign body ${Key}\`).toBeDefined(); | K: readable foreign object body. |
| 3158 | expect(await state(foreign.businessId)).toEqual(foreignState); | K: foreign business persisted state. |
| 3159 | expect(await digest(foreignId)).toBe(foreignDigest); | S: retained foreign fixture digest. |
| 3160 | for (const key of keys.get(foreignId)!) expect(await bytesHash(key), \`foreign bytes unchanged ${key}\`).toBe(foreignBytes.get(key)); | K: exact foreign bytes unchanged. |
| 3161 | expect((await request.get(\`/api/v1/listings/${foreign.listingId}\`).expect(200)).body).toMatchObject({ businessId: foreign.businessId, contactPhone: foreign.phone }); | K: foreign listing HTTP 200/business/contact identity. |
| 3179 | draftId = ((await post("/api/v1/listings/drafts", primary.owner, { businessId: primary.businessId, initialPayload: payload(photos, primary.phone) }).expect(201)).body as { id: string }).id; | K: primary draft creation 201. |
| 3193 | expect(command.input.IfMatch).toEqual(expect.any(String)); | K: generator If-Match. |
| 3194 | expect(command.input.CacheControl).toBe("no-store"); | K: private generator no-store. |
| 3195 | expect(Buffer.isBuffer(command.input.Body)).toBe(true); | K: actual generated buffer at transport boundary. |
| 3236 | expect(preparing).toHaveLength(mode === "publish" ? 3 : 1); | K: exact selected upload count. |
| 3237 | for (const upload of preparing) expect(upload).toMatchObject({ state: "PREPARING", claimTargetType: "listing", claimToken: expect.any(String), claimDeadline: expect.any(Date) }); | K: real PREPARING token/deadline/listing target type. |
| 3239 | for (const upload of preparing) expect(upload).toMatchObject({ claimTargetId: targetId, claimToken: preparing[0]!.claimToken }); | K: common claim target and token. |
| 3240 | if (mode === "publish") expect(await db.listing.findUnique({ where: { id: targetId } })).toBeNull(); | K: unpublished target absent. |
| 3241 | else expect(targetId).toBe(primary.listingId); | K: attach owns the existing target. |
| 3245 | try { expect(execute("reset", id)).toMatchObject({ code: 1, receipt: undefined }); } | R: reset refusal while generator recorded. |
| 3247 | expect(await digest(id)).toBe(beforeBlockedReset); | R: preservation of blocked-reset journal. |
| 3248 | expect(await state(primary.businessId)).toEqual(beforeState); | R: business snapshot under refused operator reset; independent HTTP/tenant state assertions retained. |
| 3255 | try { expect(await workerCleanup("recover", now, 3)).toBe(mode === "publish" ? 3 : 1); } | K: real recovery count. |
| 3259 | expect(await db.mediaUpload.findUniqueOrThrow({ where: { id: photo.id } })).toMatchObject({ | K: exact recovered upload state/token/deadline/target/retiredAt. |
| 3263 | if (mode === "publish") expect(await db.mediaUploadCleanup.findUnique({ where: { uploadId: photo.id } })).toBeNull(); | K: publish records no cleanup. |
| 3264 | else expect(await db.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: photo.id } })).toMatchObject({ status: "PENDING", attempts: 0, objectKeys: manifest(photo.key), nextAttemptAt: preparing[0]!.claimDeadline }); | K: attach exact PENDING manifest and original claim deadline. |
| 3267 | expect(keys.get(id)).toHaveLength(mode === "publish" ? 15 : 20); | R: fixture object-width accounting. |
| 3268 | expect(keys.get(foreignId)).toHaveLength(15); | R: control fixture object-width accounting. |
| 3270 | expect(before).toHaveLength(mode === "publish" ? 61 : 66); | R: primary reservation row count. |
| 3271 | expect(await owned(foreignId)).toHaveLength(65); | R: control reservation row count. |
| 3276 | try { expect(await asynchronousReset(id)).toMatchObject({ code: 0, receipt }); } | R: reset success while generator suspended. |
| 3281 | try { for (const key of keys.get(id)!) expect(await head(key), \`absent before generator resumes ${key}\`).toBe(404); } | NP4: cleanup removes retired manifest; reset-wide fixture object absence is R. |
| 3286 | expect(terminalObjects).toEqual([...keys.get(id)!].sort().map(object_key => ({ object_key, upload_id: expect.any(String), bucket: "listing-photos", absent: true }))); | R: exact historical campaign object ledger. |
| 3287 | for (const photo of photos) for (const object_key of manifest(photo.key)) expect(terminalObjects).toContainEqual({ object_key, upload_id: photo.id, bucket: "listing-photos", absent: true }); | R: per-upload historical object ledger membership. |
| 3288 | expect(completedBeforeRelease, "PUT must still be suspended after exact reset, not timed out").toBe(false); | R: PUT must outlive whole reset. NP4 retains actual in-flight PUT/cleanup overlap without reset. |
| 3290 | expect((await pending).status).toBeGreaterThanOrEqual(400); | K: HTTP refuses after lost claim; new persisted no-publication/no-attachment assertions prevent a false successful finalization. |
| 3291 | expect(refusals).toHaveLength(mode === "publish" ? 3 : 1); | NP4: late-byte refusal; exact 3/1 fixture refusal count is R. |
| 3292 | for (const status of refusals) expect([404, 409, 412]).toContain(status); | NP4: direct late conditional writes refuse 404/409/412 in generation-versus-retirement case. |
| 3293 | expect(await digest(id)).toBe(terminal); | R: terminal reservation digest. |
| 3294 | expect(await objectLedger()).toEqual(terminalObjects); | R: terminal campaign object ledger. |
| 3295 | for (const key of keys.get(id)!) expect(await head(key), \`late generator cannot resurrect ${key}\`).toBe(404); | NP4: no byte resurrection after retirement. |
| 3300 | expect(await workerCleanup("outage", now, 1)).toEqual({ cancelledPreparations: 0, deleted: 0, waiting: 1 }); | K: attach outage waits without claiming deletion. |
| 3302 | expect(work).toMatchObject({ status: "PENDING", attempts: 1, lastError: "controlled disposable S3 outage" }); | K: durable attempt/error/status. |
| 3303 | expect(work.nextAttemptAt.getTime()).toBe(now.getTime() + 60_000); | K: exact 60-second retry interval. |
| 3304 | expect(await digest(id)).toBe(terminal); | R: terminal reservation digest during outage. |
| 3305 | expect(await objectLedger()).toEqual(terminalObjects); | R: campaign object ledger during outage. |
| 3307 | expect(await workerCleanup("clean", new Date(work.nextAttemptAt.getTime() + 1), 1)).toEqual({ cancelledPreparations: 0, deleted: 1, waiting: 0 }); | K: retry deletes one item and completes. |
| 3308 | expect(await db.mediaUploadCleanup.findUniqueOrThrow({ where: { uploadId: photos[0]!.id } })).toMatchObject({ status: "DONE", attempts: 2, lastError: null }); | K: DONE/attempts=2/error cleared. |
| 3310 | expect(await digest(id)).toBe(terminal); | R: terminal reservation digest after cleanup. |
| 3311 | expect(await objectLedger()).toEqual(terminalObjects); | R: campaign object ledger after cleanup. |
| 3312 | for (const key of keys.get(id)!) expect(await head(key)).toBe(404); | K: recovered attach manifest absent; reset-wide adopted stock disposal is R. |
| 3318 | try { expect(execute("reset", id)).toMatchObject({ code: 0, receipt }); } | R: duplicate terminal reset receipt. |
| 3320 | expect(await digest(id)).toBe(terminal); | R: duplicate terminal digest. |
| 3321 | expect(await objectLedger()).toEqual(terminalObjects); | R: duplicate terminal ledger. |
| 3322 | for (const key of keys.get(id)!) expect(await head(key)).toBe(404); | NP4: repeated cleanup cannot revive bytes; operator retry object inventory remains an operational gate. |
| 3328 | try { expect(execute("reset", foreignId)).toMatchObject({ code: 0, receipt }); } | R: control reservation reset receipt. |
| 3332 | for (const key of keys.get(foreignId)!) expect(await head(key)).toBe(404); | R: foreign fixture disposal absence; foreign product preservation remains K and NP4. |
| 3339 | for (const reservation of cleanupIds) expect.soft(execute("reset", reservation).code, \`exact reset ${reservation}\`).toBe(0); | S: retained exact fixture cleanup. |
| 3340 | for (const requestId of smsIds) expect.soft(await queue.getJob(requestId), "SMS has no email job").toBeUndefined(); | S: retained no email job for SMS. |
| 3344 | expect.soft(failure, \`exact known key cleanup ${key}\`).toBeUndefined(); | S: retained exact known-key cleanup. |
| 3348 | expect.soft(references, "catalog retained while referenced").toBe(0); | S: retained catalog reference safety. |

Assertions reached through helpers are unchanged where other cases use them. This tail stops invoking `supportRaceDisposed` and `mediaDisposed` as historical-disposal oracles:

| Helper assertions | Disposition |
|---|---|
| `supportRaceWait` line 2120 and gate/lock waiter checks | R: old ordering premise. Other live HTTP reopen lock proof remains unchanged. No lock-budget increase. |
| `supportRaceDisposed`: support erasure fence and conversation absence | B2 explicitly reads both absence outcomes; snapshot plus message/outbox/read-state absence checks prevent resurrection. |
| `supportRaceDisposed` → `supportDisposed`: retained audit IDs/actions with identity/text redaction | Direct product audit/retention/erasure tests remain unchanged in ServiceLifecycle and existing campaign cases; disposal-specific audit-ID history is R. |
| `supportDisposed`: owned graph absent, sinks/queue empty and permanent per-request dedup tombstones | Product account/retention/byte behavior stays in direct suites. Exact operator inventory, queue drain and restart remain mandatory. Per-reservation journal/dedup history is R. |
| `supportRaceDisposed`: exact record/event counts and repeat reset snapshots/receipt | R: duplicate historical reservation accounting. Existing lost-response and retry cases remain. |
| `mediaDisposed`: disposed manifest, retained audit rows, allowed table list, exact removed row keys, cleared delivery/SMS sinks, absent jobs, permanent Redis dedup value/TTL | R: historical fixture-disposal identity and counters. No product HTTP admission, tenant isolation or private-object rule is inferred from these. Operator inventory, queue drain, restart and late-object proof remain blocked until executed. |
| `journal` invocations after removed reset phases | R: removed with the corresponding historical phase. Fixture setup guards before product recovery remain unchanged. |

No independently required assertion is silently dropped. The strict attach deadline/backoff and the HTTP finalization boundary stay in this file instead of being inferred from NP-4. The 10-second transport budget, child bounds and suite timeout are unchanged. No skip/todo was added.

## History and attempt accounting

Read the full assembly receipt, parent read-only working ledger, reset-tail disposition report and `/tmp/carberk-resume-20261021/0ca-api.log`. The log SHA-256 is `8a3a7c5e1a46a133ff93c211c4ac5e3c1d6fe446d93c9459866965a94d3f5575`; it reports API 3496/3500, ServiceLifecycle 8/8 and CleanRetiredUploads 23/23 on published 0ca. Those are historical results, not this candidate's result.

The parent corrects the earlier report's first-RED claim: B2 first verified reached `eb60330a91d19faf84ce91a5b05e6e815449bac2`, run 39580237134/API119155875762; B3 `232a66c38a253980fadc523ba924f77d9c444127`, run 39557809075/API119081707241; B4 `eb60330a`, same run/job as B2. B3 diagnostic/test iterations `3d7442d6`, `0921f579`, `a43ee64e` remain counted. B2's later phase diagnostic `a43ee64e` and uncertified earlier total remain visible. This assignment authorizes one bounded equivalent-coverage batch, not a fresh repair budget or a claim of zero prior attempts. B1 and B5 are untouched.

## Focused verification and handoff

Evidence logs are in `/tmp/897-reset-tail-ceb5764e`. Commands were run only in this isolated tree. No local SQL, Docker, new service, deployed reset, Railway, device, native build, PR mutation or integration push ran.

| Command | Result |
|---|---|
| `pnpm install --offline --frozen-lockfile` | PASS |
| `pnpm --filter @auto-tm/contracts build` then `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @auto-tm/db build` | PASS, shared code generation/compilation only; no database connection |
| `pnpm --filter @auto-tm/api typecheck` | PASS |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS |
| `pnpm --filter @auto-tm/api exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0` | PASS |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` | PASS collection only; parameterized cases are listed as templates, not runtime proof |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/listings/application/PublishListing.spec.ts src/modules/listings/application/AttachMedia.spec.ts --reporter=dot` | PASS 81/81 |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/ExpireServiceContent.campaign.spec.ts src/jobs/CampaignSupportRetention.spec.ts src/jobs/serviceRetention.spec.ts src/jobs/S3RetiredObjectStore.spec.ts src/jobs/CleanRetiredUploads.spec.ts --reporter=dot` | PASS 36/36, boundary evidence only |
| `pnpm check:runtime-imports` | PASS |
| `git diff --check` | PASS |

Setup history: the first DB build failed because contracts had not yet been compiled in this fresh tree. Building dependencies in order resolved it without source edits. One focused compile correction added the already branch-established non-null listing ID to the new attach readback. No hosted repair, diagnostic rerun or deadline change occurred. Historical root attempts are not reset.

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Every old assertion classified; product HTTP/auth/isolation and strict retry values retained | Inventory above and exact base-to-checkpoint diff | PASS inspection |
| Real selected-worker terminal SQL refusal, present and absent target, unchanged foreign tenant | New CampaignFullV3 parameterized cases | BLOCKED execution, hosted required `pr` check |
| Publish/attach HTTP loss plus persisted refusal; retained auth/isolation case | Rewritten media cases plus unchanged ordinary business-media case | BLOCKED execution, hosted required `pr` check |
| In-flight PUT/private-byte cleanup/late refusal | Unchanged CleanRetiredUploads 23-case suite, NP-4 publish/attach and generation-versus-retirement | Historical 0ca PASS; exact assembled candidate still required |
| Ordinary retention/reopen/account deletion/private bytes | Unchanged ServiceLifecycle 8-case suite and other retained direct tests | Historical 0ca PASS; exact assembled candidate still required |
| Operational inventory/quiescence/reset/reseed/restart/restoration | Clean acceptance §§3.2–3.9 | BLOCKED, separate operator owner before deployed/native acceptance/release |

Safe full-CI proof target: parent assembles this checkpoint with the separately owned B1 source batch, inspects the exact combined diff, and publishes that single assembled candidate through the existing required `pr` workflow. Its `pnpm test:api` owns disposable PostgreSQL/MinIO execution for CampaignFullV3, ServiceLifecycle and CleanRetiredUploads; preserve the complete worker gate, including unchanged B5 and its existing repair cap. Do not run destructive suites against staging. No full CI launch is authorized or performed by this sub-agent. Independent review and deployed/native/operator proof remain parent-owned. No whole-repository unit/typecheck claim is made from these focused checks.

Docs: no external dependency, service contract, domain ownership or schema changed, so no external documentation lookup, schema regeneration test or overview update was needed. Immutable ADRs, production source, migrations, NP-4, ServiceLifecycle, B1 and B5 blobs remain unchanged.


## Parent-review fixture correction

Correction base `28b1d225a506e47281c1787bf021ca7da11c1e1d`, tree `619566bb4260990a84858c5d76924f952fdcf015`. The original present-target fixture was invalid: it set terminal state while leaving `object_hash=NULL`. Generated `objectInventory` at `scripts/staging-campaign.mjs:921` rejects that state before the lifecycle authority reaches its disposed `RETURN false`. This correction changes only the negative fixture and this receipt; all prior outcome assertions remain.

Validity rationale from the full generated checks:

- The fixture now explicitly asserts an empty object ledger and the original `identities`/NULL manifest. One UPDATE sets `disposed` and the hash using the exact generated objectHash expression. The empty inventory has no unclaimed upload, excess entries or non-absent object. This records the real empty inventory rather than substituting an authority result. Teardown restores both fields to `identities`/NULL before existing fixture cleanup.
- Binding still checks the exact reservation, candidate, profile, version and roster. Integrity still validates schema/journal/event/tracking hashes, trigger definitions, record keys, current live row hashes and event versions. None of those inputs is edited. Auth, delivery/SMS, service and diagnostic inventories remain installed and inspect the same tracked graph. No journal tombstones, events, credentials, SQL functions or contract hashes are forged. No retained public row is mutated by fixture preparation.
- Preflight still scans unknown schemas, incoming FK shape and ownership, scalar/polymorphic/JSON references, media claims/manifests/references and diagnostic references. The existing ordinary Support graph and foreign reopened graph are unchanged. The generated disposed branch exempts cleanup-event budgeting but does not demand that the tracked Support rows already be deleted. The candidate/function-hash check still precedes the disposed refusal.
- Thus the live graph is a deliberate negative fixture for terminal authority, not a claimed completed reset. The worker must return zero and preserve that graph. An integrity/preflight exception still fails the test. The absent-target case remains separate evidence for actual fixture disposal. Neither case is an operator-reset receipt.

Verification log correction: the earlier successful initial-candidate compiler logs are `/tmp/897-reset-tail-ceb5764e/api-typecheck3.log` and `/tmp/897-reset-tail-ceb5764e/api-tsc6-3.log`; `api-typecheck-final.log` and `api-tsc6-final.log` contain the superseded TS2375 failure and must not be cited as PASS. The successful initial lint is `api-lint3.log`. The follow-up correction is checked separately below. No original failure log is overwritten or removed.

Correction commands, all offline, each completed with exit 0 (PASS):

- `pnpm --filter @auto-tm/api exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0`, log `/tmp/897-reset-tail-ceb5764e/api-lint-correction-verified.log`.
- `pnpm --filter @auto-tm/api typecheck`, log `/tmp/897-reset-tail-ceb5764e/api-typecheck-correction-verified.log`.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, log `/tmp/897-reset-tail-ceb5764e/api-tsc6-correction-verified.log`.
- `git diff --check`, log `/tmp/897-reset-tail-ceb5764e/diff-correction-verified.log`.

No behavioral tests, test collection, SQL, services, Docker, CI, deployment/reset, device/native action or integration push ran in this correction. Hosted execution must still establish real SQL refusal, preserved target/foreign state and zero storage requests on the assembled candidate. Static fixture inspection and compile/lint cannot establish that runtime result. This is one correction of the newly introduced fixture, not a timing repair or a reset of historical attempt accounting.
