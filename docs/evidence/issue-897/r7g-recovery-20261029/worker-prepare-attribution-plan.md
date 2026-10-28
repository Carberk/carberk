# Worker prepare attribution plan

Source-only checkpoint, 2026-10-29. No profiler, database client, container, compiler, build or test was started. Maintenance verification at86b02a23 is unchanged. No optimization, partition change, migration reservation or reset-guard implementation is included.

## Evidence and input

The authoritative RED is aa5eed1d with65024d52 evidence. Saved `ownership-batched-native` observations independently reproduce31 prepare samples at101–1630ms, maximum statement1549.198ms;58 at1784–4684ms, maximum2931.553ms; and3 at4886–4987ms, maximum125.964ms. Every sampled prepare has null wait_event. Permission refusal was reached at1683ms, accepted cleanup started at1705ms, and the unchanged5-second oracle failed at5004ms. Sampling establishes statement occupancy, not internal function self-time.

Saved before contains102 grants/components/orders/raw/anchors and one report/proof/request. All102 grants were available. Failure-state contains10 erased and92 available grants. Thus the retained ownership7 database is materially partial. Of the100 selected due grants,90 remain independent and selected; the other two available grants are outside the due100.

The existing normalized100 private command SHA256 is `0cc55f9db0bbe795fb2a1c14e4d8b7bef3cb0b0a58ea3299facd1e4ee8990e22`. It has100 roots/rows, operation ownership_expire, null actor/session. Its keys equal the saved before's exact100 due grants. Every expected grant tuple equals before after typed timestamp normalization. The10 committed grant IDs equal the first10 saved sorted command rows. Reuse that exact input, not a newly selected remaining90 command. Private payloads and connection refs stay under `/tmp` with mode600.

## Effective98 source chain

`diagnostic_prepare_source` inserts a receipt; `diagnostic_source_insert_receipt`, last replaced by message-enquiry fences, owns preparation. On a successful ownership_expire path it calls parser twice, scope twice, lock_keys twice and final effects once. Campaign preparation and namespace rediscovery remain between those stages. The second scope and parser are intentional revalidation after waits.

The purge parser invokes disposal effects once; the purge scope wrapper invokes it once; final effects invokes it once. Therefore successful prepare derives disposal five times. Each derivation invokes `diagnostic_ownership_disposal_scope(NULL, cutoff, grant_id)` once per intended grant. For the exact10 input this means50 disposal-scope invocations; full100 means500 if every stage reaches completion. These are source-path counts, not measured calls, and an early refusal reduces them.

The core scope is the guard-repair function renamed `diagnostic_source_scope_before_purge`. It scans all77 registry classes on each fixed-point pass, issuing one dynamic inventory query per class. It checks the unchanged combined step>100 / total-keys>1000 guard at pass entry. Discovery of a User endpoint does not add a root subject. For this command explicit subjects remain empty; grant-derived component/anchor/proof roots still yield outgoing and selected incoming closure.

For each returned inventory row, source_key performs metadata lookup, source_add normally performs two more through key validation, and each nonnull outgoing reference adds two more. Inventory serialization performs metadata lookup through source_read and field projection per key. The initial metadata function unnests/scans the77-entry immutable registry on each invocation. PostgreSQL expression evaluation can change actual invocation counts; measure rather than equating source occurrence with cost.

The receipt trigger also enumerates77 classes and filters the entire key array by namespace, with a metadata call inside that predicate. It then issues one `SELECT ... WHERE to_jsonb(s) @> key FOR UPDATE` per scoped key. Source_read uses the same containment predicate without the lock. These predicates do not directly name the indexed PK columns. Actual plans/buffer counts, not that source shape alone, establish scan cost.

## Ranked falsifiable hypotheses

1. Registry metadata dominates repeated closure/key validation. Prediction: metadata/registry self-time and call counts consume most prepare time, amplified with scoped rows and passes. Falsifier: low cumulative metadata time while another stage dominates. Only then consider the immutable no-argument registry-map candidate.
2. Repeated row reads/locks dominate through containment scans. Prediction: phase timing outside parser/scope/effects or EXPLAIN ANALYZE of the exact existing per-key SQL shows repeated sequential scans and large row/buffer work. Falsifier: these statements consume little relative time with this fixture.
3. Repeated parser/disposal derivation dominates. Prediction: parse/disposal/ownership-disposal inclusive time and counts account for a substantial fraction after separating descendant self-time. Falsifier: their self-time is low and scope dominates independently.

No cost ranking is yet proved. App planning/roundtrips are not the primary lead because the saved occupancy lies inside prepare.

## Next isolated proof, not started

Use a new task-only project `candidatea-r7g-attribution` with one PostgreSQL container, a dynamically assigned host port, no Redis/MinIO, and a database named `candidatea_r7g_attribution_before`. Do not use60936/60937,65379,5432/6379/9000 or any retained project. Send the actual port/container/database/role and input/function/data hashes to coordinator before measurement START. No quiet-host interval is reserved during preparation.

1. In the scheduled window, export retained ownership7 read-only using its private owner connection and one consistent snapshot. Capture complete public schema/data, migration rows, function/guard fingerprints and role/grant description. Do not DDL, revoke, reset, prepare or write there. Close/drain exporter and record its PID plus unchanged retained row/guard/receipt fingerprints. A missing export privilege is an explicit finding, not grounds to elevate the retained principal.
2. Restore into the new resource only. Use the exact historical98 migration/function surface, expected checksum87dd1162b90c334137859cbaf4afd61af068f50602a4ec438d041b22364e95b1. Reconstruct the saved pre-run tuples for the eight saved relations before guard activation in this shadow fixture only; preserve all other copied rows. Recreate equivalent restricted-worker grants locally. Compare all saved before rows after PostgreSQL typed normalization, full copied retained inventories, function definitions, guards and receipts0/0. Record any incompleteness. This is an attribution fixture, never pristine ordinary/native acceptance.
3. Start shadow PostgreSQL with track_functions=all. Do not change retained server/session configuration. Use pg_stat_user_functions before/after snapshots and inclusive/self-time deltas, allowing for stats flush; do not reset shared counters. SET-search_path SQL functions should be noninlined, but missing SQL-function observations remain UNKNOWN. An exact function clone with counters is fallback only on this isolated resource.
4. First baseline is the exact saved100 command through real `SELECT public.diagnostic_prepare_source($1::jsonb)::text`, under the equivalent restricted principal in a fresh READ COMMITTED transaction, always ROLLBACK. Bound the statement at15s and lock waits at250ms, with a20s client deadline. Record success or exact SQLSTATE/message/context; do not replace scope_limit with a relaxed cap. The15s attribution bound does not change the original native5s oracle.
5. Profile the exact saved first10 command, never alternative partition sizes. One real prepare/ROLLBACK plus separately timed parse, scope, keys and effects invocations under the same restricted principal. Each invocation gets its own fresh transaction with15s statement bound and20s client deadline, maximum six invocations for this first measurement. Capture per-function call/self/inclusive-time deltas, per-table scope counts, sorted scope/keys/effects hashes and source/campaign receipt rollback. Refused/unreached phases stay UNKNOWN. Do not run a producer or native test.
6. Only if those counters cannot attribute scope, create cloned scope-wrapper functions in the isolated database, forwarding to a copied core with notices at each pass and table-query boundary. Log step, per-table distinct-key counts, query duration and the exact guard branch, without key or payload contents. Preserve the original SQL expressions, registry order, cap check and equality termination. Compare full successful uninstrumented/instrumented scope values; instrumentation timings are diagnostic, not acceptance.
7. Drain all scoped PIDs, verify exact shadow row/guard fingerprints and0/0 receipts, stop the new resource, then RELEASE with hashes and literal commands. No original native acceptance rerun until a separate genuinely pristine full100 fixture is established.

Parameter-bound phase SQL, using the private driver rather than shell-interpolated JSON:

```sql
SELECT public.diagnostic_prepare_source($1::jsonb)::text;
SELECT public.diagnostic_source_parse($1::jsonb);
SELECT public.diagnostic_source_scope($1::jsonb);
SELECT public.diagnostic_source_lock_keys($1::jsonb,$2::jsonb);
SELECT public.diagnostic_source_effects($1::jsonb,$2::jsonb);
SELECT funcid::regprocedure::text, calls, total_time, self_time
FROM pg_stat_user_functions ORDER BY funcid::regprocedure::text;
```

Scope/keys/effects use the same parsed command and returned scope, transferred as bound private parameters. Profile artifact names are `input-provenance.json`, `clone-fingerprints.private.json`, `baseline100.json`, `phase10.json`, `function-deltas.json`, and `drain.json` under `/tmp/897-r7g-worker-attribution-20261029`. Measurement has not started; no result is implied by this plan.

## Smallest conditional repair

If metadata dominates, propose only a no-argument immutable registry_map derived from the sole existing registry and replace metadata lookup with exact object lookup. Before applying any migration, prove all77 entries, unknown/null behavior and duplicate-name refusal/equivalence, then compare entire sorted scope/keys/effects OLD/NEW on identical100 and10 inputs with rollback. No closure, root inventory, lock order/trylock, privilege, graph cap or disposal semantics change. Other hypotheses require their own measured smallest repair proposal; no such repair is selected now.

The restored reset brief at a096a8db confirms the existing exact immutable binding/table-lock/inventory/receipt/lost-reply boundary addressed by the prior reset proposal. Independent contract review remains pending; no reset SQL, guard or executor change is authorized by this attribution plan.
