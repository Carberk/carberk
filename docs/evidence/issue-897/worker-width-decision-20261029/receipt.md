# Worker prepare width decision receipt

29 October 2026. #897 / PR904 Milestone A, R7g decision comparison. Parent `728c726b889ed4ed8d0bb3c1c04bad3d7697de0d`. This is diagnostic evidence, not acceptance. It ran no native test, producer, build or cleanup. It changed no production source, partition width, cap, closure, guard, revalidation, race assertion or test. The machine receipt is [receipt.json](receipt.json); drivers are in [scripts](scripts).

## Verdict

Prepare cost follows scope entries, not command count. No partition width that fits the unchanged cap gets near five seconds. The cap-fitting maximum is 40 roots. At 40, one command alone costs 5.3 s on a clean host. The full 100-grant pass needs about 11 to 13 s of `diagnostic_prepare_source` at any width, and the test adds a refused first phase of about 1 s on top. If the biggest single cost, `diagnostic_source_scope_before_purge`, cost nothing, the rest would still be about 5 to 6 s. The unchanged 5000 ms cannot hold with complete closure, both fresh revalidations and one `cleanup()` call.

The 5000 ms is the unset Vitest default for the worker package. I found no product SLO and no feature or ADR criterion behind it. The coordinator's own dispatch and review adopted it as an "original" budget. See the authority trace. Whether to keep it is a coordinator or founder decision. I did not assume a waiver.

## Pins

| Item | Value |
|---|---|
| Parent HEAD | `728c726b889ed4ed8d0bb3c1c04bad3d7697de0d` |
| Migration count | 101 (98 saved-clone migrations are exactly the first 98 by name and checksum, then 162, 163, 164) |
| Manifest SHA-256 | `62c0801e82b228cd4bb2aa26845e35e5e4714215bdb338c47cc7b2dd140f8b90` ([migration-manifest.json](migration-manifest.json)) |
| 162 / 163 / 164 `migration.sql` | `aebf91d7…` / `e6447a2c…` / `fe7358f9…` (164 is byte-equal at `bb4cf5f5f`) |
| Key-predicate spec | `6529917c…` |
| Worker source | `65024d52` blobs, identical at `aa5eed1d`; nine worker/test/fixture files plus `apps/worker/vitest.config.mts`, hashes in receipt.json |
| Saved dump / command | `9d981c29…` dump; normalized100 command `0cc55f9d…` (100 roots/rows) |

I did not copy worker source into the checkout. Measurement needed only the selection and width-10 logic (`DiagnosticArtifactWorker.ts` line 305), so byte-exact blob copies are in `/tmp/897-r7g-decision-20261029/src` and the tree has no duplicate for the parent assembler.

## Clone and setup

A new loopback PostgreSQL 16.15 container (`r7g-decision-pg-262ac29e`, port 57128, `track_functions=all`, default settings, JIT on). Retained ownership7 was never opened. I restored the saved private dump, rebuilt roles from the saved role export, and used the same worker role name with a fresh password and the saved grants. I then reconstructed all eight saved-before relations. Restored functions, guards and data equalled the saved export first.

- All eight classes equal the saved before after typed normalization: grants 102, components 102, orders 102, raw 102, reports 1, anchors 102, proofs 1, requests 1.
- All 100 original command/source tuples equal the clone's grant rows.
- At the 98 state, data `1db78561…`, guards `74f89176…`, table privileges, worker function and table privileges and function definitions all equal the prior accepted clone.
- `prisma migrate deploy` applied 162, 163, 164. Migration rows equal the manifest, 101 of 101 finished.
- 101 state: 190 functions `c6b87edc…`, 354 guards `74f89176…` (unchanged), migrations `ca4bced0…`, data `a43ba3b5…` (only `_prisma_migrations` changed), worker function privileges `e05c208f…`, worker table privileges `56a2a53f…` (unchanged), registry `6d7b15db…`.
- Added 17 functions (maintenance wrappers, `diagnostic_source_registry_map`, `diagnostic_source_key_predicate`), changed 13, removed none. Every added function is owned by postgres, has default ACL, and carries `search_path=pg_catalog, public`. The worker role gained EXECUTE on exactly those 17.
- Worker role: login, not superuser, no CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, no memberships. Session check as the worker: READ COMMITTED, `session_replication_role=origin`, both guard-ready functions true.
- The ten-root group 1 scope hash equals the registry163 receipt (`ce8ca056…`), so 162 and 164 leave that output unchanged.

## Command selection and sizing

The worker order (`rightsUntil` ascending, then id) equals the saved command order; all 100 due grants share one `rightsUntil`. The shared-proof candidate `1742ffa5` is index 11 (group 2 at width 10). Its predecessor `9f31c4c0` is index 68.

Sizing used untimed rolled-back scope calls and one untimed full prepare, only to choose widths. The cap guard is `step>100` or more than 1000 scope entries at pass entry.

| Range | Entries | Lock keys | Result |
|---|---|---|---|
| `[0:10]` (group 1) | 240 | 370 | pass |
| `[10:20]` (group 2, shared proof) | 275 | 423 | pass |
| `[0:20]` | 515 | 793 | pass |
| `[0:35]` / `[0:40]` | 875 / 995 | 1348 / 1533 | pass |
| `[0:41]` | over 1000 | | `P0001 diagnostic_source_scope_limit` |
| `[40:80]` / `[80:100]` | 995 / 480 | 1533 / 740 | pass |

So 40 is the largest prefix under the cap, and an aligned width-40 partition (995, 995, 480) fits in every group. Prepare of `[0:40]` also passed untimed (995 scope, 1533 keys, 122 effects). The 100 roots total 2470 entries. Group 2 is 35 entries above its siblings because the shared-proof closure pulls in the pair's order, grant and component.

Widths measured: 10 (`rows[10:20]`, the original group 2), 20 (`rows[0:20]`, the group holding the candidate at width 20) and 40 (`rows[0:40]`). Each is the exact command prefix from the saved command, root order preserved, full closure.

## Measurement

Three interleaved rounds of `SELECT public.diagnostic_prepare_source($1::jsonb)::text` as the worker role. Each phase is a fresh connection and transaction at READ COMMITTED, with 15 s statement limit, 250 ms lock limit and 20 s client deadline. Each phase rolled back. Function stats, host load and Docker CPU were captured around every call. A "clean" call had no competing test or compiler process before or after it.

| Round | Width | Entries | ms | ms/entry | Host |
|---|---|---|---|---|---|
| 1 | 10 | 275 | 1267 | 4.61 | clean, load 2.9 |
| 1 | 20 | 515 | 2336 | 4.54 | clean, load 2.8 |
| 1 | 40 | 995 | 5321 | 5.35 | clean, load 2.8 |
| 2 | 10 | 275 | 1298 | 4.72 | clean, load 2.6 |
| 2 | 20 | 515 | 2430 | 4.72 | busy seen only in the after-capture, load 2.7 |
| 2 | 40 | 995 | 11239 | 11.30 | contended, load 2.7 to 10.7 |
| 3 | 10 | 275 | 1376 | 5.00 | contended, load about 10 |
| 3 | 20 | 515 | 3422 | 6.65 | contended |
| 3 | 40 | 995 | 7887 | 7.93 | contended |

Another task's `vitest run scripts/staging-clean-reset-redis-recovery…` plus a `prisma migrate deploy` started during round 2. The preflight was clean and I did not wait or reserve a quiet host. Clean data is round 1 (all three widths) and round 2 width 10, with round 2 width 20 probably clean. Only one clean width-40 sample exists. Contended samples show how much a loaded host adds: up to 2.1 times on width 40. Output hashes (scope, keys, effects) are equal across all three repeats of each width, and the width-10 and width-20 scope hashes equal the sizing calls.

Reading the clean data:

- Cost per entry is flat, 4.5 to 4.7 ms at widths 10 and 20 and 5.35 at width 40. There is no fixed per-command cost to amortize, so fewer, larger commands do not help.
- Full-pass prepare at 2470 entries: width 10 about 11.4 to 11.7 s, width 20 about 11.2 to 11.7 s, width 40 about 13.2 s. Differences between the first two are inside run variance.
- `diagnostic_source_scope_before_purge` self time is 55%, 56% and 52% of prepare (702, 1309, 2770 ms). It is the dynamic 77-class inventory loop, run twice per prepare. The rest is about 2.0 ms/entry at widths 10 and 20, so about 5 s per pass even at zero scope cost.
- The refused first phase prepares group 1 once more, about 1.1 s. Disposals add about 100 ms per group.
- Registry, `diagnostic_source_read` and the key predicate are small now (key predicate 32 ms self at width 10).

These projections are arithmetic from measured per-entry costs, not an observed full pass. They are a warning that is no longer a single-shot guess: three repeats show the same per-entry cost, with 162, 163 and 164 all present.

## Drain and cleanup

After the runs: receipts 0/0, no clients, all eleven fingerprints byte-equal to the pre-measurement values (functions, guards, migrations, data, privileges, ACLs), 102 grants and 102 components still `available`, none erased ([drain-decision.json](drain-decision.json)). The container was stopped (exit 0) and removed with its volume at 2026-10-29T06:41:59Z. Other containers (`r7g164_pg`, `t3-58ab493d-reset-inspect`, the retained candidatea stack) were not touched.

## Authority trace for the 5-second budget

1. **The test.** In `DiagnosticWorkerOwnershipExpiry.e2e.spec.ts` at `aa5eed1d` the `it()` at line 123 has no timeout argument and no elapsed assertion. The only `5000` is the observation sampler's cutoff, added by `0c2a8fd50` ("Bound ownership statement observation to original five seconds"). The held original at `332f4b55` also declares no timeout.
2. **The runner.** `apps/worker/vitest.config.mts` sets no `testTimeout` (same blob at HEAD, `aa5eed1d` and `65024d52`), so Vitest's 5000 ms default applies. Other apps set theirs: API 120 s, admin 30 s, sms-gateway 30 s. Worker specs with heavier work set explicit bounds: Watchdog 15 s, listing-view-retention 20 s, unsupported-jobs 20 s, ServiceLifecycle 60 s.
3. **Governing documents.** ADR-0109, ADR-0104, Feature 50, Flow 66 and `apps/worker/CONTEXT.md` contain no time bound for ownership expiry. They require complete closure, declared-rights-end retention with "no blanket TTL", and generic 403 for expired grants. The worker overview lists real bounded budgets elsewhere (for example the listing-view retention 30 s budget). None applies here.
4. **Dispatch.** The ownership batching contract review says "Worker Vitest configuration has no test-timeout override; the reported native criterion remains 5000ms", and says an oracle that "lengthens five seconds would directly contradict the accepted criterion". Milestone A restates "within original 5s". The same review cites no feature or founder text for it.

Classification: a coordinator-imposed runner default, carried forward as an "original" verification budget by the coordinator's own dispatch. It is not a product SLO, and I found no explicit accepted budget in the criteria sources. The founder search was incomplete, so this is not a waiver and I make none.

## Proposed bounded test-harness correction (for review, not applied)

Smallest change: one file, `DiagnosticWorkerOwnershipExpiry.e2e.spec.ts`, one test.

- Add `const budgetMs = 60_000;` with a comment that it is an explicit finite verification budget sized from this receipt.
- Replace the sampler's `Date.now() - started >= 5000` with `>= budgetMs`, and pass `budgetMs` as the `it()` third argument.
- Keep every assertion, the refused-then-accepted single test, all 100 grants, the cap, partition width 10, both revalidations and the race tests exactly as they are.

Why 60 s: the clean full-pass estimate is about 12 to 14 s including the refused phase. The worst contention seen here was 2.1 times, giving about 30 s. 60 s is twice that and matches the ServiceLifecycle convention. It is finite, so a hang still fails. Do not tune it to a passing run.

Why per-test and not `testTimeout` in the worker config: the config also governs the B5 renderer specs, which the coordinator holds to the 5000 ms default. A package-wide change would loosen them.

If the coordinator keeps 5 s: the repair has to cut the per-entry cost about 2.4 to 2.8 times with both revalidations intact. Removing all `scope_before_purge` self time still leaves 5 to 6 s, so no source-only optimization I can see reaches 5 s. In that case the unchanged oracle conflicts with the complete-closure and revalidation requirements, and only the founder can resolve it.

## Not established

- No native run. The new oracle correction is unproved on a pristine fixture; one native run on a fresh full-100 clone is still needed after any decision.
- Only one clean width-40 sample. A clean rerun of width 40 alone would need a new START.
- No timing for groups other than 1, 2 and the 20- and 40-root prefixes. Projections for other groups use the measured per-entry rate.
- The clone uses default PostgreSQL settings on a shared Docker VM. CI timing can differ.
- Ten extended race and capacity cases were not provisioned or run.
