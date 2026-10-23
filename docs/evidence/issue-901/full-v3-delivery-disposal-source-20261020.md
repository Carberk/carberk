# Full-v3 exact delivery disposal source

Source slice for #901 under #897 and sole draft PR #904. Base `be9eb12c47ffb1ee5ab47d993eb43ad5dec93ad0`, root's doc-only successor of pushed `c5f2b50660a6feb976cecbc2e1d7e31e26bcb529`, so the executable source is identical. Branch `agent/issue-901-v3-delivery-disposal-20261020`, reserved and pushed before edits. The acceptance spec, the worker helper, `withCampaignEmailDelivery`, the enqueue adapter and the worker module are unchanged.

This slice does not establish hosted GREEN, deliver auth or release completion, or activate anything operationally. It is not full-v3 completion.

## Hosted RED and cause

- **`93f158c3`.** PR Checks `39419437839`, API job `118616495648`, logs `/tmp/carberk-next-release-20261020/93f158c3-api-118616495648.{raw,plain}.log`.
  - Foreign-queue case: `reset` exits 1, expected 0, at spec line 292.
  - Active-delivery case: the worker claims its own exact job. `reset` refuses, but the manifest stays `identities` where `cleaning` is expected (line 346).
- **`c5f2b506`.** API job `118630137364`, logs `/tmp/carberk-next-release-20261020/c5f2b506-api-118630137364.{raw,plain}.log`, lines 2358-2445. Both failures above are unchanged. The changed-candidate case now passes its candidate-refusal and unchanged-session assertions. It then fails its final correct-candidate `reset`, which exits 1 where 0 is expected (line 368).
  - Plain-log lines 2552-2650 hold the PostgreSQL `CONTEXT: ... inline_code_block line 2 at RAISE` for the `cf_a8…` reset transaction. Its `STATEMENT` ends with the v3 guard `IF EXISTS(... campaign_delivery_ledger) THEN RAISE EXCEPTION 'Campaign delivery disposal unavailable'`, just before `SET state='cleaning'`.
  - The `ERROR:` text itself is outside the captured window. The attribution therefore rests on the statement and context, plus the source.

Cause: `businessMain` v3 reset refused whenever the delivery ledger was non-empty. That refusal happened inside the transaction that would have committed `cleaning`. Every case that issues an ordinary OTP therefore exits 1 and leaves the namespace in `identities`. The three reset assertions run independently of TOTP, grants and admission. The main case's current first failure is TOTP enrollment at line 150, which this slice deliberately leaves closed.

## Change

**`scripts/staging-campaign.mjs`, v3 only, gated by `bootstrapV3`.**

The v3 reset sequence:

1. Table locks, then the namespace advisory fence. Integrity, the complete FK, polymorphic and JSON preflight, and the cleanup budget checks follow, then `state='cleaning'` is committed. The ledger refusal is removed. The fence is committed **before** any Redis access. From then on:
   - the owned OTP, Session and other graph writes refuse (`Campaign graph cleaning`);
   - `withCampaignEmailDelivery` refuses both enqueue and worker mock sends, because it requires `state='identities'`;
   - the ledger is fixed, because ledger rows are only inserted by an OTP insert in `identities`.
2. The exact ledger (`request_id`, `email`) is read and passed to the existing v1 `campaignQueueMain` through `disposeDeliveries(…, false)`. That function:
   - inspects only the journaled job IDs and refuses a foreign payload, recipient, purpose, parent, repeat or dependency;
   - compares every dedup key atomically, then sets permanent no-TTL tombstones `disposed:<ns>:<candidate>:<requestId>`;
   - reinspects the jobs and refuses an `active` job;
   - removes only the owned jobs and verifies their absence and the tombstones.

   Any refusal throws, the process exits 1, and the namespace stays retryably `cleaning`, with ledger, rows and sink intact. No queue is enumerated, drained or obliterated.
3. Same locks, integrity and preflight. Then the following run in one locked transaction:
   - `DELETE` the namespace's protected `campaign_delivery_sink`;
   - redact the owned audits;
   - run the child-first deletes, which now include the recorded `otp_requests` after `sessions` and before `users`;
   - re-run integrity, then the `Campaign disposal incomplete` check;
   - set `state='disposed'`.
4. Terminal branch, run on a fresh disposal and on every retry. A locked integrity and terminal check now also refuses `Campaign delivery sink retained`. Then `disposeDeliveries(ledger, true)` runs in observe-only mode. It requires every job to be absent and every dedup key to hold exactly the permanent tombstone. It writes nothing and never recreates missing proof.

   A lost-response retry therefore returns the same terminal receipt without adding events. The v3 terminal receipt adds `queueJobs: 0, sinkRecords: 0`.

Supporting v3 trigger and integrity changes, needed so that locked disposal can delete the exact OTP rows:

- An OTP `DELETE` is still refused in `identities`, including normal retention. It is now permitted only outside `identities`. In `cleaning` the existing lock-set rule still admits it only under the complete disposal table-lock set; in `disposed` it refuses.
- The delivery inventory is lifecycle-aware. In `identities` it is unchanged: every ledger entry needs a live OTP record. Outside `identities` a ledger entry may point to a deleted OTP record, but the ledger itself stays permanent and hash-bound. Every OTP record still needs a ledger entry, and every sink row still needs a ledger entry.

`campaignQueueMain` now accepts binding profile `campaign897-full-v3`, but only for the fixed fifteen-alias v3 roster. The v1 binding keeps exactly its four aliases, and every other profile refuses before Redis.

**`scripts/staging-remote.mjs`** (necessary internal transport seam). The existing v1 Redis disposer closure is hoisted unchanged into a `const`. It keeps its exact Redis origin attestation, binding and `{"queueJobs":0}` contract. v1 and v3 both receive it; v2 explicitly receives none. This is the only way `businessMain` can reach the API-process queue.

Unchanged by this slice:

- TOTP enrollment and backup codes, elevation, grants, admission, content and moderation, and any whole-graph expansion.
- Retry, timeout and concurrency settings.
- The budgets: 128 records, 2048 events, 128 deliveries.
- The CLI, the controller and the Railway entry points; v3 stays closed there.
- The v1 `campaignMain` and every v2 path.

## Local evidence and limits

Everything ran offline, with no Docker, database, Redis, staging, provider or CI action.

- `node --check` on both scripts: PASS.
- `node /tmp/issue901-v3-disposal-source-check.mjs`: PASS. It uses a fake transport, compares against `c5f2b506` and executes no SQL or Redis. It shows:
  - v1 `campaignMain` is byte-identical;
  - five v2 SQL paths are byte-identical: fixture, reset from `identities`, reset from `cleaning`, reset from `disposed`, and probe;
  - v3 fixture SQL differs only in the OTP-delete lifecycle and the ledger inventory, and keeps 22 triggers and the same lock set;
  - for v3 resets from `identities` and from `cleaning`, the order is: `cleaning` commit, then Redis disposal, then locked sink and SQL deletion (OTP after Sessions, before Users), then terminal observe;
  - a v3 retry from `disposed` observes only and writes nothing;
  - queue binding: v1 accepts its own roster and refuses v3-only aliases; v3 accepts only its roster; v2 refuses before the Redis client is created.
- The spec-style concatenation of both scripts compiles in a VM: PASS.
- `git diff --check`: PASS.
- `node --test scripts/staging.test.mjs scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs scripts/staging-railway.test.mjs`: PASS, 153/153 with 0 failed or cancelled, exit 0; log `/tmp/issue901-v3-disposal-controls.log`. It uses the fake provider harness, with no real provider action.
- `pnpm check:agent-docs`: PASS.

The SQL, BullMQ and HTTP behavior, including the trigger's lifecycle-aware OTP delete inside real PostgreSQL, is **not executed locally and remains unknown** until root's hosted lane runs the unchanged spec.

## Predicted next hosted assertions (not evidence)

- **Foreign-queue case (line 292 onward):** reset should exit 0. `assertDisposed` should see no owned rows, no job, a permanent tombstone and an empty sink. The other reservation's digest and the foreign job should be unchanged. Late enqueue rejects, the late mock send exits 1, the late request returns 500, and verify returns 400.
- **Active-delivery case:** the first reset should exit 1 with the manifest `cleaning` and the job retained. The refused request returns 500. After release, reset exits 0, is disposed, and is idempotent on retry.
- **Changed-candidate case:** the final reset at line 368 should exit 0. This case then has its first full pass, since it has no TOTP dependency.
- **Main case:** unchanged first failure at TOTP enrollment, line 150.

## Unresolved risks

- The `moveToWait` release by BullMQ in the active case must not alter the tombstoned dedup key. The pinned 5.76.8 behavior is inferred, not executed here.
- The changed-candidate final reset deletes the Session, the bound OTP and the User. Any untracked side row written by ordinary sign-in would refuse in preflight as a foreign reference. That would be a genuine finding, not something to bypass.
- TOTP, elevation, grants, admission and content disposal remain unimplemented. The main case cannot reach disposal until those slices exist.
