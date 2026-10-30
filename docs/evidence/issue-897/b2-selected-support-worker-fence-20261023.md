# B2 selected Support worker fence, 2026-10-23

Bounded test checkpoint for #897 / parent PR #904. Base: `0ca85a6276286278b49333cfa25e0cc99cd93166`. Branch: `agent/issue-904-b2-worker-fence-test-20261023`, in the fresh host-owned isolated worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-3ae15b9a` (original scaffold `t3/3ae15b9a` at the base SHA).

This addresses **reset-tail disposition ledger B2**, not the unrelated mobile B2 row in the release acceptance matrix. Inputs were `/tmp/release897-reset-tail-disposition-20261023/report.md` and the [clean-acceptance contract](../issue-901/prelaunch-clean-acceptance-contract-20261021.md). The founder's disposable prelaunch history decision does not waive security, tenant isolation, erasure, retention, private bytes or worker fencing.

Added exactly one test in `apps/worker/src/jobs/ExpireServiceContent.campaign.spec.ts`: **“fences a selected due Support worker after terminal disposal and preserves a foreign tenant on repeat”**. It calls `ExpireServiceContent.execute` with the real `CampaignSupportRetention` and `S3RetiredObjectStore`. The database boundary fake lives in `apps/worker/src/jobs/application/testing/TerminalSupportRetentionDatabase.ts`; storage uses the existing S3 transport fake.

The database selects a due closed case, then transitions the namespace to disposed before returning that stale selection. Discovery retains its exact tombstone claim even though the target graph is gone. The database authority answers `admitted: false`. Both executions must reach that authority with the selected case, current candidate, exact clock and purge phase, return all-zero work counts, enter no purge row-lock/read/write work, and issue zero storage requests. The foreign open case participates in the database's candidate inventory; its customer, assignment, conversation epoch, message, attachment and fence state remain unchanged, with case/conversation readback through the fake database. Repeat execution deliberately supplies the stale selection again.

| Criterion | Evidence | Result |
|---|---|---|
| Selected worker respects disposed namespace | Exact database authority observation on both executions; zero result counters; purge-entry guard untouched | Offline pass |
| Foreign tenant remains unchanged | Full fixture comparison plus database case/conversation readback | Offline pass |
| No private storage work; safe repeat | Existing real S3 adapter receives zero transport requests across two executions | Offline pass |
| Existing lifecycle/private-byte coverage preserved | Only the new test, its boundary fake and this receipt differ from base | Source preserved; hosted rerun pending |
| Same-candidate operator quiescence/reset replacement | Not run in this bounded task | Still required |

Focused checks (offline):

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/ExpireServiceContent.campaign.spec.ts src/jobs/CampaignSupportRetention.spec.ts src/jobs/serviceRetention.spec.ts src/jobs/S3RetiredObjectStore.spec.ts --reporter=dot
pnpm --filter @auto-tm/worker typecheck
pnpm --filter @auto-tm/worker exec eslint src/jobs/ExpireServiceContent.campaign.spec.ts src/jobs/application/testing/TerminalSupportRetentionDatabase.ts --max-warnings 0
git diff --check
```

Results: **4 files, 20/20 tests pass** (5 worker campaign tests, 4 retention boundary tests, 3 retention policy tests, 8 private storage tests); typecheck, affected-file lint and whitespace checks pass. A sensitivity check temporarily changed only the fake database's admission response to true: the new test failed at `Disposed Support namespace must not enter purge work`, reached through the real purge callback. The fake was restored and the focused suite rerun green. No production authority was changed.

Fresh-worktree preparation required the configured local contracts/database builds. The first test invocation could not resolve the unbuilt `@auto-tm/db` entrypoint; the first database build lacked `DATABASE_URL`. Building with a nonconnecting placeholder URL generated the Prisma client and local output. Those setup failures were not behavioral RED evidence. No database connection, migration or service was started. Docs: no external lookup needed; no dependency, service contract or production behavior changed.

Limits: this proves the worker's response to the SQL authority's terminal refusal through boundary fakes. It does not execute the SQL authority, establish PostgreSQL lock ordering, prove an actual reset race, or supply live storage/operator evidence. `ServiceLifecycle.e2e.spec.ts` remains byte-identical to base (SHA-256 `c26899da009eb0b0bdd73fa9f3b0ab83dfd36be861ed317d9419f4b517b9d144`); its reported base 8/8 hosted result is not a new run here. `CleanRetiredUploads.e2e.spec.ts` also remains byte-identical (SHA-256 `6b14beddab8285c63b8dc5b80e74b8b57770aaf657c1d75e8883b7c186d38d4f`). All existing assertions, budgets and production source remain unchanged.

No services, Docker, HTTP/e2e tests, CI commands, Railway, reset, deployment, emulator or signing operations were run. This checkpoint retires none of the old CampaignFullV3 tails. Parent assembly still needs same-candidate operator quiescence/clean-reset proof and applicable hosted verification. No PR was opened; the parent assembles this checkpoint into #904.

## Parent-requested sensitivity correction, 2026-10-23

Continues checkpoint `21c3101eed9b0a952ecd984144ec85bfaa604b84` on the same issue branch. The parent correctly identified that its absent target plus throwing row-lock guard established callback entry, not observable protection of extant private content. The historical receipt above is preserved; this section supersedes its guard-based sensitivity claim and exact authority-call oracle.

Kept the stale-selected absent-target repeat case. Added **“retains selected private Support data and foreign data when terminal authority refuses, including on repeat”** to the same spec. The same database fake now has a retained-target mode: the selected due closed case, its private conversation/message/attachment, customer linkage, audit reason, subscriptions, outbox and read state all remain present. An unrelated foreign open case and its private data remain in the same database inventory. Terminal SQL refusal is still supplied by the boundary, not inferred from a missing target or implemented as a production disposal predicate.

The fake supports the actual normal purge reads and mutations: row-lock queries return normally; conversation epoch/erasure updates, private message deletion, attachment retirement, linkage redaction, audit redaction/creation, fence upsert and cleanup completion change stored state. The existing S3 transport fake also supports normal delete/HEAD outcomes when seeded with private objects. Production `ExpireServiceContent`, `CampaignSupportRetention` and `S3RetiredObjectStore` remain real and unchanged. No repository module is mocked.

The retained-data test executes twice, then compares target and foreign state to their pre-execution snapshots, including unchanged lifecycle epoch, audit contents and empty fence collections. It reads target case/conversation state through the database boundary, requires all-zero worker results and zero storage requests, and verifies both seeded private objects remain present. Authority observation requires only a disposed/refused response to have been observed; there is no exact SQL call-count/order assertion. The old purge-entry guard and its assertion were removed.

Sensitivity experiment: temporarily changed only this test's database-fake option from `{ targetPresent: true }` to `{ targetPresent: true, admitted: true }` and ran:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/ExpireServiceContent.campaign.spec.ts -t 'retains selected private Support data' --reporter=verbose
```

The real worker completed both executions without a query guard/storage exception. The test failed at `expect(target).toEqual(beforeTarget)`: the selected message/outbox/subscriptions/read state were deleted, attachment was removed, customer linkage redacted, lifecycle epoch advanced from 0 to 1, audit reason cleared and `SERVICE_CONTENT_PURGED` appended, and an epoch-1 fence created/completed. This is an observable retained-content failure. The admission override was restored before final checks; no production source or authority was edited.

Final focused checks use the same four named files and commands above: **4 files, 21/21 tests pass** (6 worker campaign, 4 retention boundary, 3 retention policy, 8 private storage); worker typecheck, affected-file lint and whitespace checks pass. All four original campaign-spec cases and their assertions remain, as do the original service-lifecycle/retention/private-byte suites and budgets. The existing 8/8 `ServiceLifecycle` hosted evidence remains historical, not rerun here.

Scope remains simulated database refusal only. The fake does not implement PostgreSQL transaction isolation, the SQL disposal predicate, reset semantics or real concurrency. This receipt proves neither operator quiescence nor same-candidate reset safety, and it authorizes retirement of no original tail. No services, CI, infrastructure, device, subagent or PR operations were performed. Parent assembly and same-candidate operator/hosted evidence remain required.
