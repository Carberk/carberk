# Redis recovery RED checkpoint: binding blocker

Test-writer handoff for #901 under #897 / sole integration PR #904. Base: `1eb5a0c6cb75c297397e99fc5717cefd3b2e29cf`. Reservation branch: `agent/issue-901-redis-recovery-red-20261021`, pushed at that base before edits. Host scaffold: `t3/redis-clean-reset-recovery-red-test`, unchanged at the base.

**Blocked before authoring the executable test. No runtime RED was obtained.** The selected [recovery design](prelaunch-reset-redis-recovery-design-20261021.md) establishes the recovery policy, but leaves the executable binding below unspecified. This handoff neither changes that policy nor requests execution authority. The [clean-acceptance contract](prelaunch-clean-acceptance-contract-20261021.md) remains governing.

## Exact missing contract

1. **Rows receipt digest.** The design requires `expectedInventory: {digest, rowsReceiptDigest}` but defines neither the hashed representation nor a source for `rowsReceiptDigest`. Ordinary S2A emits a completed rows receipt with `digest: {schema, retained, disposable}`; it emits no scalar receipt digest. The stored row also includes `committed_at`, omitted from S2A's recovery read. Hashing stdout, canonicalizing the stored row, or hashing just its result are different bindings. Selecting one in the test would invent the protocol.
2. **Trusted binding ingress.** The design requires owner claims, lease commit, closure/deployment binding, both service IDs and both origins to bind the operation. The existing strict remote command accepts only `operation`, `phase`, `operationId`, `reservationId`, `candidate`, `identity`, and (for mutation) `expectedInventory`. Its environment checks establish target/candidate identity, not lease ownership or producer closure. Ordinary S2A stores neither owner/lease/closure/deployments nor API/worker IDs or canonical origins. No specified remote input or existing adapter supplies those missing trusted facts to this serialized program. Adding caller fields, a quiescence boolean, a fake ledger receipt or ambient authority would violate the assignment.
3. **Recovery record encoding.** The design describes pending/completed `redis_state` semantics and a marker key “such as” `staging-clean-reset:receipt:<operationId>`, but gives no exact legal pending/completed field sets, marker encoding, or binding representation. Those are needed to distinguish exact, malformed, contradictory and changed-binding recovery fixtures without manufacturing authoritative receipts. The existing operator schema validator permits only its current nine columns; the requested extension must remain a later reviewed source/schema change.

Source anchors at the supplied base: [strict request and target checks](../../../scripts/staging-clean-reset-remote.mjs#L43), [operator schema](../../../scripts/staging-clean-reset-remote.mjs#L100), [stored receipt read](../../../scripts/staging-clean-reset-remote.mjs#L181), [rows receipt binding](../../../scripts/staging-clean-reset-remote.mjs#L212), [receipt insertion and completion](../../../scripts/staging-clean-reset-remote.mjs#L255), and [closed Redis deletion](../../../scripts/staging-clean-reset-remote.mjs#L301). Existing disposable harnesses: [S2A](../../../packages/db/scripts/staging-clean-reset.e2e.spec.ts), [Redis inventory](../../../packages/db/scripts/staging-clean-reset-redis.e2e.spec.ts). Repository search found `rowsReceiptDigest` and `redis_state` only in the selected recovery design before this note.

Root must settle the digest representation and the trusted binding ingress/record contract before the test can exercise the full requested recovery slice. This is an interface clarification, not permission to weaken strict validation or enable controller/CLI closure. No new public authority is proposed here.

## Evidence and limits

| Required checkpoint evidence | Result |
|---|---|
| Exact base, clean worktree, reservation pushed before edits | Verified with local Git and branch push |
| Actual completed ordinary S2A receipt, then actual Redis inventory | Not run; disposable hosted PostgreSQL/Redis and a specified binding are prerequisites |
| First new assertion: successful bounded Redis completion | Not authored; predicted current failure is `Clean reset refused: target` because the required two-field `expectedInventory` fails the existing one-field validator |
| Delete/preservation, immutable rows receipt, pending/completed state and marker | Blocked by the binding contract above |
| Lost Redis reply / PostgreSQL completion gap, once-only recovery, pending without marker | Blocked; no committed effect or authoritative receipt fabricated |
| Completed-marker absence replay; restored queues, missing DB authority, changed binding and unknown-state refusals | Blocked; no recovery assertions claimed |

Only this evidence note changed. No spec placeholder, skipped test, guessed receipt object, production edit, existing test edit, schema/dependency/config change, local Docker/service/test runtime, live target access, credentials, CI dispatch/polling, deployment, reset, deletion or GitHub issue/PR mutation was performed. Branch pushes are the only live network operations initiated by the writer. T3 registered the existing integration PR as required by the host; that is thread metadata, not a GitHub mutation.

Offline verification: `node scripts/check-agent-docs.mjs` and `git diff --check` passed. Typecheck, lint and Vitest collection were not run because no TypeScript test could be authored within the specified interface. Docs: not applicable — source/design inspection only; no external dependency changed or new API selected. Hosted runtime classification and any later source authorization remain with root.
