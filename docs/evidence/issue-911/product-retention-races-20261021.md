# Product Support retention race proofs, 2026-10-21

Test writer for #911/#901 under #897 and PR #904. Branch `agent/issue-911-product-retention-races-20261021`, host-created worktree. Base `a43ee64ebf695f9ebf661d9b28604b8cebcaca3e`. Test-only: no source, schema, CampaignFullV3 or operator-reset change. No PR, integration write, local service, staging or CI dispatch.

## Classification

These are additive characterization proofs. Source already rereads the selected Support case under its row lock and rechecks `supportCaseDue` and `conversation.erasedAt` (`ExpireServiceContent.ts`, `purge` closure). No RED is claimed. Hosted execution is pending and batched by root. If either test fails hosted, retain that RED and return it for root source assignment.

## Gap closed

The existing `rechecks reopened cases` test creates an already-open row. Selection excludes it, so it never reaches the guarded reread. The existing account-deletion test runs erasure before the worker starts, so the worker never holds a stale selection. `ServiceMessaging.e2e.spec.ts` proves the HTTP transition (customer message reopens: `status` open, `closedAt` null). `PrismaServiceMessaging.locked` takes the lock order users, `support_cases`, `service_conversations`, all `FOR UPDATE`; the test reopen mirrors it. It does not involve the worker. The new tests add only the ordering evidence. They run on the ordinary product path with fresh UUIDs, so `CampaignSupportRetention` finds no `cf_*` claim. They neither pause other workers nor depend on reservation cleanup.

## Scheduling oracle

- `pauseAfterSelecting(caseId)` is a transparent `Proxy` over the real `PrismaService`. Only `supportCase.findMany` is wrapped. It runs the worker's own selection query and returns its rows unchanged. If those rows contain `caseId`, it then waits for the test. Every other member is passed through, bound to the real client. Selection is followed by `CampaignSupportRetention` discovery, which does not lock, and then by the per-case transaction. The pause therefore lands after the due case is selected and before the worker requests any lock.
- Test 1 also uses a real reopen transaction as its lock holder. Its `pg_backend_pid()` is the oracle. `pg_stat_activity` is polled every 25 ms until a backend whose `pg_blocking_pids` include the holder is running `support_cases ... FOR UPDATE`. That backend is the worker waiting on the guarded row lock.
- Time bounds: selection 10 s, holder lock 10 s, worker blocked 10 s, reopen commit 10 s, account erasure 20 s, worker completion 20 s, test 60 s. Each wait fails with a named message.
- In `finally`, the test releases the pause and commits the holder. It then drains the worker and reopen promises with `Promise.allSettled`, so the original failure is preserved. The drain adds no timeout. Once the gates are released, it is bounded by the real database transactions (the worker's per-case transaction and the reopen transaction's 20 s timeout) and by the storage transport. Fixture IDs and object keys are pushed to the spec's existing tracked arrays and removed by its `afterAll`.

## Test 1: reopen commits before the worker obtains its row lock

Title: `keeps a selected due Support case when a reopen commits before the worker obtains its row lock`.

Preconditions: one Support case, `closed`, with `closedAt` 2000-01-01, which is due at `now` 2000-06-01. It has an unerased conversation, one message, an adopted attachment and MinIO bytes.

Order of events:
1. The real `ExpireServiceContent` selects the case and pauses.
2. The reopen transaction locks the user, the Support case and the conversation. It sets `status: "open"` and `closedAt: null` and writes `SUPPORT_REOPEN`. It does not commit yet.
3. The worker resumes and is observed blocked on the case row lock.
4. The reopen commits, and the worker completes.

Assertions:
- Case: `open`, `closedAt` null, same `customerId`, `assignmentVersion` 0.
- Conversation: `erasedAt` null, `lifecycleEpoch` 0.
- Content: 1 message; the attachment is still `adopted`, with `removedAt` null and the same uploader.
- No erasure fence and no `SERVICE_CONTENT_PURGED` audit.
- The object still answers HEAD.

Remove the reread due check and the worker would purge under the lock, failing every assertion above.

## Test 2: account erasure wins before the stale selected worker resumes

Title: `lets completed account erasure win over a stale selected Support purge without resurrection or foreign loss`.

Preconditions:
- Customer A has a due closed Support case, and A's deletion is scheduled for 2000-01-01.
- Customer B has a `completed` History request and customer C has an `open` Support case. Each has a message and bytes.

Order of events:
1. The worker selects A's case and pauses.
2. The real `PurgeExpiredAccounts` runs to commit.
3. The test checks the intermediate state: A's conversation is erased with `lifecycleEpoch` 1. Its fence has `epoch` 1, `objectKeys` `[key]` and `cleanupCompletedAt` null.
4. The stale worker resumes and completes. Its cleanup phase completes the fence. Before the late sweep, the test requires `cleanupCompletedAt` equal to `now` and a 404 for the target object.
5. One late sweep runs with the real `objects` store wrapped by a transparent counter. Each `deleteAndVerify` manifest containing the target key increments the counter and is still delivered to the real store unchanged. No result is faked and nothing is deleted by the wrapper. Manifests for unrelated cases in the same worker database are forwarded and not constrained.

Terminal assertions for A:
- Conversation: `lifecycleEpoch` still 1 (the worker did not fence again).
- Fence: `epoch` 1, `objectKeys` `[key]`, `cleanupCompletedAt` equal to `now`.
- Case: `closed`, `customerId` null, `assignmentVersion` 0 (a worker purge would increment it).
- No `SERVICE_CONTENT_PURGED` audit, 0 messages, the attachment is `removed` with no uploader, and the object returns 404.

Terminal assertions for B and C:
- Each conversation is unerased at epoch 0, with 1 message and no fence.
- The bytes are present and the owning `customerId` is unchanged.

NP3 oracle: the target-key request count for the late sweep must be exactly 0. This is an explicit counted assertion. Nothing is inferred from the job or file passing.

Remove the reread `erasedAt` check and the stale worker would raise the epoch to 2 and write the purge audit.

## Current source contract

- Selection reads `status closed`, `closedAt <= now - 90d` and `conversation.erasedAt null`, outside any transaction.
- Each case then runs `SELECT ... support_cases FOR UPDATE`, then reread, `supportCaseDue` and an `erasedAt` check, then a conversation lock and purge.
- Account erasure locks the user and the customer's cases and conversations. It fences with `lifecycleEpoch + 1` and records byte keys, and the worker's cleanup phase deletes those bytes.

## Offline checks (this worktree, no services)

`DATABASE_URL` was an unreachable placeholder for Prisma generate/build only, as in CI.

| Command | Result |
| --- | --- |
| `pnpm --filter @auto-tm/worker typecheck` | pass |
| `pnpm --filter @auto-tm/worker lint` | pass |
| `pnpm --filter @auto-tm/worker build` | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/ServiceLifecycle.e2e.spec.ts` | collected, 7 tests skipped (not hosted) |

## Hosted command

The PR checks `api` job runs `pnpm test:api` against disposable PostgreSQL and MinIO, with per-vitest-worker databases. For a focused run inside that job environment: `pnpm --filter @auto-tm/worker exec vitest run src/jobs/ServiceLifecycle.e2e.spec.ts`.
