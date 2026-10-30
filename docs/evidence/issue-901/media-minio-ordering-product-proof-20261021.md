# NP-4 media ordering on MinIO: test-premise correction, 2026-10-21

Test checkpoint for #901 under #897, integration PR #904, from integration SHA `7e077fab`, with one follow-up for failure-path test isolation. The only test file changed is `apps/worker/src/jobs/CleanRetiredUploads.e2e.spec.ts`. The follow-up also updates this note and the NP-4 line of `prelaunch-clean-acceptance-contract-20261021.md`. Neither changes product source, requests, signals, timeouts, retries, concurrency, guards or ordering assertions. Nothing is skipped and no assertion is softened. This is an approved correction of a test premise. **It is not a claim that the source is GREEN.** `CampaignFullV3.e2e.spec.ts` `:2299` and both `:3288` media cases are unchanged and remain RED. They stay RED until an equivalent direct hosted proof and the S1/S2 operator replacement exist.

## Diagnosis

Hosted log `d70406b0-failed.plain.log`: both NP-4 cases fail at `held.inFlight()` (`:387` publish, `:433` attach). Each takes about 10.2 s and logs "error in a non-retryable streaming request". Just before each failing assertion, `presentInBudget(upload.keys)` sends a HEAD for the thumbnail key, which the If-Match PUT is still holding. MinIO serializes requests on one key. That HEAD waits until the PUT's 10 s signal aborts it, and then it answers. So `inFlight()` reads false (aborted). The old oracle needed two things together:

1. a same-key read, or a whole-manifest DELETE and verify, would answer while the PUT is held; and
2. the held PUT would then be refused.

On a store that serializes per key, neither can be true. The prior read-only diagnosis says DELETE is serialized in the same way. That diagnosis was not a hosted run. A diagnostic agent used local Docker, which was out of bounds. That result is not acceptance evidence and is not relied on here.

## Changed oracle mapping

| Old premise (both cases) | Replacement |
|---|---|
| After recovery, `presentInBudget(all 5 keys) == 5` while the PUT is held | `presentInBudget` on the 4 non-held keys `== 4`. The held key's kept bytes are proven when the PUT matches its pre-recovery ETag and is `written`. |
| DB recovery, work and tombstone assertions | Retained unchanged: publish → AVAILABLE with no work, then the fixture retires it; attach → RETIRED with exact PENDING work. |
| Cleanup completes (`deleted: 1`, DONE, DELETED, 0 keys) while the PUT is held | The product sweep runs on an observed real client. The test waits for its `DeleteObjectCommand` on exactly the held key. While the PUT is still held it asserts: work `PENDING` with attempts 1, upload `RETIRED`, keys before the held key absent, keys after it present (these are new round trips to the same MinIO, answered), the command log exactly `[versioning, earlier DELETEs answered, held-key DELETE unanswered]`, and `held.inFlight()`. |
| `release()` → PUT refused (404/409/412) | `release()` → PUT `written` (not `aborted`, not refused). Then the sweep returns `{0,1,0}`. The command log is versioning, every DELETE and every verifying HEAD, all answered. Work is `DONE` with attempts 1 and `lastError` null, the upload is `DELETED`, and all 5 owned keys are absent. |
| Foreign account intact | Retained: the foreign User, active Listing, ListingMedia and ADOPTED upload are unchanged, with no work and byte-identical objects. |
| — | Added: a later sweep on a fresh observed client returns `{0,0,0}` and issues **zero** storage commands. |

Failure-path isolation: `sweepAgainstHeldPut` captures the first error thrown while the PUT is held. On every path it then releases the PUT and drains both `held.outcome` and the sweep. Only after that does it rethrow the captured error, or else a PUT or sweep rejection. A cleanup error cannot mask the first assertion, and no sweep keeps running into the next case.

The ordering proof comes from the store's own answers, with no sleep. The DELETE is observed as issued before release. The If-Match PUT is then `written`, which needs the object to still exist with the old ETag. After that, every key answers 404 and no other writer exists. So MinIO applied the PUT before the DELETE, and cleanup removed what the late generator wrote. The observer only forwards each command to the real client with its own signal and records when it is issued and answered.

The stale-ETag PUT-after-cleanup refusal test ("generation versus retirement") is byte-identical. Test names changed from "…held across … cleanup resurrects nothing" to "cleanup waits for a generator PUT held across …, then nothing survives". The NP-4 line of contract note `prelaunch-clean-acceptance-contract-20261021.md` now matches this wording.

## Verification (offline only)

`tsc --noEmit` passes for the worker. `eslint --max-warnings 0` passes for the file. `vitest run` collects 23 tests, all skipped because the run is not hosted. No local Docker, services, staging, Railway or CI dispatch was used.

## Expected hosted result

In the worker hosted suite, `CleanRetiredUploads.e2e.spec.ts` should report 23/23 passed. Each NP-4 case should take well under 10 s, because nothing waits on the PUT's signal. If MinIO did not serialize DELETE behind the held PUT, the before-release assertion that the held-key DELETE is still unanswered would fail. The PUT would also come back 412 instead of `written`. Either failure would disprove the diagnosis, not the product. CampaignFullV3 `:2299` and `:3288` ×2 are expected to stay RED.

## Limitations

- A test-side observer cannot see MinIO's internal lock. Ordering is inferred from the answers above, not from provider traces.
- Only the thumbnail key is held. Other keys and multipart writes are not covered.
- The publish retirement still uses the fixture transition. Its API authority is proven elsewhere (`PrismaUploadClaims.e2e.spec.ts`).
