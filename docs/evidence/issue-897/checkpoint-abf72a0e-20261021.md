# Hosted Support cleanup boundary, 2026-10-21

Exact published candidate `abf72a0eeabfa4b02ad5101dae19fb67c30a76f1`, tree `32e8206cc9d67f2f913bd4f2da17851d1837407f`. [PR Checks 39564627730](https://github.com/Carberk/carberk/actions/runs/39564627730) completed with API failure. Lane, static, DB and frontend passed; docs was correctly skipped. [Runtime 39564627751](https://github.com/Carberk/carberk/actions/runs/39564627751) passed. [Aggregate job 119107567015](https://github.com/Carberk/carberk/actions/runs/39564627730/job/119107567015) failed only because API failed. No manual rerun was requested.

[API job 119103949094](https://github.com/Carberk/carberk/actions/runs/39564627730/job/119103949094) reports worker56/56files364/364tests and API313/315files3047/3052tests. Full-v3 has27/31 passing cases. The fifth failed case is the independent diagnostic reinspection route, still404 at `DiagnosticReports.e2e.spec.ts:308`. Its eleven existing cases pass. Host-temporary log: `/tmp/carberk-next-release-20261021/api.log`, captured with `gh run view --log-failed`. Literal ANSI text is present. Durable interpretation follows; this file does not depend on that temporary log surviving.

## Reached retention writes, incomplete cleanup

The unchanged retention test passed ordinary primary/foreign setup, foreign reopening at68/87, deadline-minus-one zero work and unchanged snapshots. At the inclusive deadline it committed the intended epoch0-to1 purge: deadline `erasedAt`, deleted messages/outboxes, customer/assignee unlinking, assignment version1-to2, a `SERVICE_CONTENT_PURGED` audit and an empty epoch-one fence. The fence had `cleanupCompletedAt:null`.

The subprocess then rejected. The rollback assertion at `CampaignFullV3.e2e.spec.ts:1737` failed before the original worker error could be displayed. `ExpireServiceContent` commits purge before attempting storage cleanup, so this snapshot mismatch alone does not establish an atomicity defect. Exact67/99 accounting, cleanup completion, foreign preservation after purge and reset/retry assertions were not reached. This is progress beyond the previous campaign guard refusal, not hosted GREEN.

Finally-reset of f5 exited1. An incomplete fence is consistent with the existing `Campaign service cleanup incomplete` guard, but reset stderr was hidden and that exact reason remains unconfirmed. Cleanup discovery/SQL authority, existing transaction bounds and real bucket-versioning/completion are unresolved possibilities. No source repair is justified until the original failure is visible. Preserve the unchanged storage versioning check and reset refusal.

## Media setup remains unproved

Ordinary media reached primary publication at73/97, then foreign-owner sign-in issuance returned400. Both race cases returned400 during foreign-business contact issuance. The refused f5 reset leaves three sign-in requests. Together with each later graph's requests these reach the shared ten-per-IP/hour policy at exactly the failing request. This strongly supports contamination, but response bodies were not captured; `RATE_LIMITED/IP_LIMIT` is not directly proven.

Attach c7 passed reservation absence and primary setup, so the namespace correction was effective. Both timing envelopes were empty, with zero dropped entries. This run provides no held-PUT/reset/recovery timing evidence and establishes no new media source defect. Do not widen production rate budgets or weaken disposal to accommodate setup contamination.

## Held next batch

Root inspected the full test-only checkpoint `b5938034f6314ea13cfb4707bdf19ec5f79ee114` and incorporated it with `-x` as `e61fd9819f62828283e7b67ac32fabcf79c6cc8c`, after held planning `c7eb6f82`. It adds independent due-namespace accounting, selected-worker/ordinary-reopen ordering and selected-worker/reset ordering, including tombstone authorization and zero storage requests. The [test handoff](../issue-901/full-v3-support-owned-worker-race-tests-20261021.md) states exact counts and limitations. All preexisting spec bytes and31 intended cases remain identical; the new total is34. Root API TypeScript, owning-workspace lint, both embedded-program syntax, docs and diff checks passed. An initial root-directory ESLint invocation could not find its configuration; the corrected owning-workspace invocation passed.

These tests remain held for one combined diagnostic batch. One isolated Sol6.1 medium test writer owns additive, bounded failure observations before existing assertions. Production source, assertions, literals, operations, deadlines, signals, concurrency and caps128/2048 remain unchanged. No CI wait or service run is delegated. Pending-cleanup behavior and media contamination remain UNKNOWN until the diagnostic candidate executes.

The recovered summary's claim that #445/#881 source was still held was stale. Root verified `fc11bfab` already incorporated as `af53c105`, `83f46854` as `94a18f30`, and source evidence as `23c5cb6b`. All are ancestors of this published candidate. No duplicate cherry-pick or new implementation is needed.

Full release acceptance remains incomplete. This receipt authorizes no operational v3 entry, staging mutation, review approval, merge, production promotion or store submission.
