# R7c upload claims implementation receipt

Initial implementation checkpoint for the parent's independent source gate. No source, integrated or runtime acceptance is claimed. Base is accepted R1 `00c66cd6b7c00b04ff9ac25199de00e72b835b89`, tree `83ef53757eca8d7a9383179e2d86be7ec08c27c0`. The supplied brief and ten immutable consumer pins own the scope. R7d `af4670bb0ea61ddab5f633ac4cc2120edbba5055` was inspected read-only and was not incorporated. PR904 is the sole linked integration PR.

## Implementation and complete transaction effects

The public UploadClaimPort and constructor are unchanged. Five existing outer entries discover once, prepare the ordinary campaign union, acquire metadata-derived numeric keys and existing rows by class, then rediscover in separate READ COMMITTED statements. Any selected row, owner, authority, target, adopter, cleanup or absence change refuses with `upload_claim_scope_changed`. There is no replay or extension after waits. Tokens, deadlines and retirement instants use the existing UUID/clock dependencies and are allocated before preparation. No new source operation, marker, port, export or coordination module was added.

| Entry | Direct effects and result |
|---|---|
| reserve | All selected uploads become PREPARING with one token, target and clock deadline. Foreign/missing/closed refuse UPLOAD_NOT_AVAILABLE; held/adopted elsewhere or existing reverse adopters refuse UPLOAD_ALREADY_ATTACHED. Same-target PREPARING joins; same-target ADOPTED returns alreadyAdopted. |
| abandon | Select every token/PREPARING row upfront; retire each and copy its own exact cleanup manifest. Empty selection is a noop. |
| release | Select every token/PREPARING row upfront; release only those frozen IDs to AVAILABLE and clear token/deadline/target. No cleanup. |
| settle | If the requested failed upload is selected, retire it and release its selected siblings in the same transaction. Otherwise false with no writes. |
| retireUnclaimed | Only the requested owner's AVAILABLE upload with no reverse adopter can reach stillInvalid. A false reinspection result retires nothing. Positive reinspection retires and records exact cleanup once. |
| finalize, supplied | Before any lock or write, discover all adopted and referenced IDs and assert live same-backend/full-xid ordinary preparation, including the source command's existing campaign companion. Check full namespace/table and numeric key coverage. Adopt only token/target-matched PREPARING uploads; references must exist and remain open. Already-adopted same target returns already. |
| retire, supplied | Assert that same live preparation and full union before writes. Missing/closed returns false; otherwise RETIRED, clock retiredAt, token/deadline null and exact INSERT ON CONFLICT cleanup. No nested prepare/finish or late lock. |

The initial union includes missing upload PKs, current and proposed Listing/Profile targets, stored upload User/Business, actor User/Session/Business, current actor membership and selected Business owner members, membership unique-user/owner slots, both User.avatarUploadId and ListingMedia.uploadId negative unique slots, all current reverse adopters and their Listings, and cleanup uploadId PK slots when retirement can occur. The finite registry reference walk also includes actual Session User, member User/Business, target seller/Business, retained avatar upload and suspendedBy User endpoints. Stored video_session targets are observed with their existing registered parents; no video production behavior changes here.

All actual writes are to media_uploads and media_upload_cleanups. Upload key/userId/businessId/objectKeys/writeProtocol stay byte-for-byte unchanged. State/claim/check constraints remain active, including PREPARING token/deadline/target and the special stored video_session constraint. No eligibility, diagnostic, membership or Listing source column is written, so their UPDATE OF invalidation/enquiry triggers are not invoked. Existing ordinary campaign guards and AFTER trackers/journals retain their authority and behavior. The SQL preparation handles the complete tracked-table/dependent-FK table prefix and sorted namespace locks before numeric/row locks.

Physical edges are media_uploads.userId -> User CASCADE, media_uploads.businessId -> Business RESTRICT, ListingMedia.uploadId and User.avatarUploadId -> upload NO ACTION, and ListingMedia.listingId -> Listing CASCADE. Their unique upload adoption slots remain backstops. Cleanup uploadId is a PK with NO physical FK, despite its registry dependency, so cleanup survives upload removal. Cleanup copies exact key/objectKeys/writeProtocol and conditional-v1 PENDING versus every other protocol LEGACY_PENDING. An existing cleanup is untouched by ON CONFLICT. No storage object or manifest generation changed.

## Consumer compatibility requires parent assignment

Do not assemble the stricter supplied helper into the old consumers without disposition. These are concrete missing keys, not a wait on consumer runtime acceptance.

- R1 PublishListing declares upload/photo roots and a Listing insert. Its source scope and lock-key functions do not derive the absent reverse `listing_media.uploadId = upload.id` and `users.avatarUploadId = upload.id` unique slots from those absent media roots. The supplied helper will refuse `upload_claim_preparation_uncovered`. Required keys are the existing registry namespaces with `hashtext(jsonb_build_array('unique', '["uploadId"]'::jsonb, jsonb_build_object('uploadId',id))::text)` and the corresponding User/avatarUploadId key. Parent should assign an upfront finite augmentation of the enclosing source preparation, preserving its one campaign/source receipt and revalidation. Never add keys after its waits. The current source command API has no general unique-slot field; no kernel/SQL/port change is authorized to this writer.
- R7d photoPlan explicitly adds the absent ListingMedia unique sentinel but omits the matching User.avatarUploadId sentinel for each old/new upload. Parent can assign that one bounded addition before run's existing numeric-key derivation, within R7d's own helper. All source, old/new upload, actual adopter, owner and cleanup bytes remain its responsibility. Its ordinary receipt remains reusable after that coverage is present.
- Pinned PrismaListingMediaRepository has no outer preparation and deletes the media row before supplied retire. R7b owns its complete pre-write union, including referenced posters, removed media, negative slots and cleanup. This checkpoint does not edit it.
- Pinned PrismaOwnedVideoSessionLedger reaches supplied retire after its own actor/target/session locks and mutations without preparation. R6b owns the complete initial video/session/generation/cleanup union. It must include R7c's required claim sub-union before its first lock, not prepare when retire is reached.
- ProfilePhotoUploadAdapter uses own reserve/abandon and delegates bind/unbind to the separate link owner. Its public errors and byte preparation are unchanged. R7d acceptance remains pending and is not inferred from its handoff.

The existing 504-line PrismaUploadClaims.e2e.spec.ts remains unchanged. Its handwritten adoptAsProfile wrapper is not production opposition evidence and lacks the new preparation. Its old upload-row barrier waits also precede the new metadata prefix. Parent must assign its adaptation with the accepted production consumers; no old assertion has been weakened to make it pass.

## Evidence and boundaries

RED checkpoint `a4cac0e6` ran five public-adapter cases, all failing for lock-before-preparation or the missing supplied check. It was pushed before production changes. The initial build/config failures and later GREEN logs are preserved in `/tmp/897-r7c-*`. The single SQL-boundary fixture replaces the old shallow spec fake and lives in application/testing. It models rollback and the finite result boundary; it does not emulate PostgreSQL lock scheduling, the SQL registry or trigger authority.

Final focused checks pass 164 tests in six files, including 56 claim cases and existing publication, Profile Photo, presign and ListingMedia checks. Focused configured lint, TS6 `tsc6 --noEmit`, TS7 `tsc --noEmit`, contracts/DB/API builds and runtime-import static checks pass. Prisma generation used a non-routable placeholder config URL; no connection was opened. Docs: not applicable, internal-only behavior using pinned repository SQL and package interfaces, with no dependency changes.

Nine new SQL cases and nine fixture graphs are AUTHORED ONLY. They cover both-order actual reserve/retireUnclaimed opposition with backend wait evidence, exact release/settle, cleanup-driver rollback, missing/finished/foreign/copied/uncovered preparation, and live ordinary supplied reuse. Every started transaction has an unconditional release and drain on assertion, timeout or failure. Fixture PK/email/key, five-key conditional manifest, state and User FK readiness are checked before negatives. It seeds no Session, so the diagnostic refreshTokenHash collision is not repeated. The suite only asserts readiness; it never installs or activates guards.

| Criterion | Evidence | Result |
|---|---|---|
| Own positive/noop/refusal/idempotency and rollback | Public adapter, finite SQL boundary, focused logs | Offline pass |
| Supplied live/missing/uncovered reuse without nested finish | Public adapter; nine authored SQL scenarios include ordinary reuse | Offline pass; SQL unexecuted |
| Exact namespace/key order, PostgreSQL waits, triggers and transactional rollback | Production code/static inventory and authored SQL | Parent runtime gate missing |
| Accepted R1 and returned R7d full coverage | Exact pinned contracts inspected above | Parent consumer assignment required |
| Actual adopt/recovery/purge/media/video opposition | R7b/R6b and enclosing source/purge owner must provide complete initial coverage | Parent-owned acceptance gap |
| Business authority positive runtime and live source receipt reuse | No fake authority accepted as runtime evidence | Parent-owned acceptance gap |

All SQL/E2E import, collection and execution counts are zero. HTTP, services, Docker, full CI, device, activation, admission, operational actions and nested agents are zero. Diagnostic40188183964 remains spent, all22 skipped in beforeAll, cleanup successful and arm removed. No retry is authorized. B5 UNUSED, cause UNKNOWN, remedy cap exhausted. Automatic admission and strict activation remain CLOSED.

Parent owns one independent source gate followed only by the already-bounded correction policy. Inspect this source and the exact consumer gaps, then accept or stop. The immutable base/head/tree, path/blob/SHA256 inventory, input/log hashes, pushed/clean status and next command are in `/tmp/897-r7c-upload-claims-20261025-handoff.md` and `/tmp/897-r7c-upload-claims-20261025-manifest.json`.
