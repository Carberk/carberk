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
