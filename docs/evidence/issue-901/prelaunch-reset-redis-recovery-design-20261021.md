# Prelaunch reset Redis recovery design

This is the next bounded engineering design under Q5 and the founder's prelaunch reset direction. It is a recommendation for implementation and review, not current behavior or permission to run a reset. The [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) owns the amended §3.3 and Q1 gates. The [remote reset program](../../../scripts/staging-clean-reset-remote.mjs) remains fail-closed: it can observe Redis, but its `redis` phase refuses because completion receipt authority is unavailable.

## Choice and boundary

Use the existing PostgreSQL `staging_clean_reset.receipts` row as the durable operation record, with a strictly validated operator-owned Redis state value, plus one atomic Redis completion marker. Keep `refs/heads/ops/staging-lease` as the sole authority for reservation, owner, candidate, target, closure, deployment and ordered phase progression. PostgreSQL and Redis records bind the same operation for recovery. Neither record grants authority, proves producer closure or replaces the lease.

The smallest implementation assignment is one RED recovery test against disposable PostgreSQL and Redis: create the existing completed `rows` receipt, write a bound pending intent, then exercise the boundary after the Redis script has written its marker and before PostgreSQL records Redis completion. The test must prove that exact marker and post-state permit one completion update, while a missing, malformed, contradictory or differently bound marker refuses before another write. Keep the current phase list and CLI/controller closure gates unchanged.

## Record shapes and strict binding

Extend the operator row in one reviewed schema change. Keep `operation_id` as the only primary key, `phase = 'rows'`, and the immutable existing `expected` and `result` fields. Add one `redis_state` JSON value whose only legal shapes are `{}` (before intent), a pending intent, or a completed Redis result. An intent binds the complete target and operation identity, reservation and owner claims from the trusted controller, lease commit and closure/deployment binding, the rows-receipt digest, the exact Redis pre-state digest, and an intent timestamp. Completion adds a redacted exact post-state and completion timestamp. Store no raw job payloads, credentials, credential-bearing URLs or Redis key names. Canonical credential-free origins remain bound, or digest-bound, as the existing target identity requires.

The `expectedInventory` field is exactly `{digest, rowsReceiptDigest}`. The full existing bound command remains strict. It reads the actual PostgreSQL rows receipt and compares operation, reservation, owner, candidate, project, environment, API/worker service IDs, canonical database/Redis origins and the recorded post-state. Caller-supplied prefixes, preservation lists and quiescence claims are not accepted. Another operation's marker, an unknown key in the reserved control namespace, an older or malformed operator shape, or any changed identity refuses before writes.

Use one exact control key such as `staging-clean-reset:receipt:<operationId>`. Its value binds the operation identity, rows-receipt digest, Redis pre-state digest and exact post-state. Do not assign an automatic TTL while the operation is open. The marker is control state and is excluded from disposable inventory.

## Atomic snapshot and deletion

The Redis script recomputes and classifies the complete bounded application snapshot, then compares exact key bytes, value bytes, Redis type and absolute expiry. Counts are reported evidence, never the comparison by themselves. It deletes only the exact observed classified set and writes the marker in that same Lua execution, with bounds and argument types checked before writes. Node computes each public SHA-256 digest from private raw snapshot bytes. Lua compares those bytes; Redis is not treated as a SHA-256 provider. The script must not accept raw keys from the caller.

Lua isolation is not rollback. A later script error, a write error, or missing completion proof leaves the operation blocked and never reports success. A producer can write after the script, so closure remains a separate gate and is rechecked on recovery. No `FLUSHALL`, `FLUSHDB`, prefix wipe or `Queue.obliterate` is introduced.

## Recovery and cleanup

Before intent, Redis receives zero writes. In a fresh uninterrupted execution, a pending intent proceeds into the same Lua call only after fresh lease, closure, target and inventory checks. If execution is interrupted while PostgreSQL holds only intent and the marker is missing, resuming is ambiguous and blocks. Fresh checks do not authorize retry of that interrupted pending intent. Empty queues alone cannot certify completion.

After Lua writes the marker, a lost Redis response is recoverable only by validating the marker and exact post-state, then recording PostgreSQL Redis completion once. Once PostgreSQL has validated Redis completion, it is the durable receipt authority. If the marker is later absent, read-only replay is allowed only with the exact recorded Redis post-state and no contradictory marker. A lost PostgreSQL response therefore replays the completed receipt and exact post-state read-only. A Redis restart that preserves the marker and post-state can continue after fresh closure evidence. Pending marker loss, restored queue data, a changed rows receipt, a malformed or conflicting marker, or missing database authority always blocks. A new operation cannot bypass an unresolved old intent.

Keep the PostgreSQL record and Redis marker through reset phases and restart checks. At separately gated closeout, first record final redacted completion and receipt hashes in the Git operation ledger. Then remove the exact marker and operation-local PostgreSQL state. Cleanup is finite and observable from that terminal ledger record. Never delete a pending intent and never use a TTL as cleanup.

## Current status and Q1 limit

No schema, source, Redis marker, controller recovery or cleanup behavior is implemented by this document. The current source still refuses Redis deletion, campaign controls without disposition, and any `cf_*` database namespace. The amended Q1 path permits disposal of inventoried prelaunch campaign scenario history only after verified global producer closure, reviewed exact inventory, protected-configuration/reference classification and ordered fail-closed recovery. Unknown structures or unresolved couplings block. It does not add a role, retention period, recovery shortcut or storage service, and it does not weaken target, closure, production-manifest or independent-review gates. The v3 path remains inactive.
