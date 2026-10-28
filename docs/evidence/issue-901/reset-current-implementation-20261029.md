# Current reset implementation checkpoint

Source commit `0e1828f7aaf4139ee75f81bfa4fa848cb3432f5f`, tree `a7613cb5bfb4214e3228d924eb1beb5c3d63d948`. Based on RED/setup receipt commit `d78ec6c0397c3c71513af18cdd71a1003ae3c3bd`. Sole writer resumed the existing checkout without resetting its dirty source. The preserved recovery patch SHA-256 is `ca9c3ff93d2780a11bb1618a34ce83470d5b92d7768f694a1acdfb686e6b43ca`.

This implements local controller, S3 wire and maintenance admission behavior. It does not activate the observer, CLI reset or any deployed execution. The real Railway adapter has no qualified `cleanResetBaseline` boundary and therefore refuses before reset effects. No live CLI, provider/storage request, reservation, deployment, credential/policy edit, DB/Redis operation or container/service was performed. No infrastructure was created. All local commands have drained.

## Source contract

`StagingControl.cleanReset` extends the existing durable owner/lease ledger. Its immutable operation binds reservation, actor, candidate, target, protected configuration/reference/scope baseline and closure generation. CAS uncertainty retains intent and admits no next effect. Current exclusion requires desired zero in every supplied application region, provider qualification covering crash/cron/rollout/wake, and exactly the admitted maintenance executor. Strict actual grant expiry and external clock-epoch continuity precede old storage-epoch termination. Unknown horizon, automatic execution, surviving accepted request, changed authority/configuration or clock discontinuity refuse. Horizon and exclusion are checked again at drain admission, after drain and before inventory-ready. Lost stop/drain replies recover under the same operation. Inventory-ready returns `rowExecution: blocked-parent-lawful-reset-contract` and `reopened: false`; it performs no row, Redis or object mutation.

The new storage module owns exhaustive collection and exact subset recovery behind the varying S3 and durable journal boundaries. Eight logical families resolve from matching API/worker configuration, deduplicating physical buckets. Explicit unbound buckets survive. Unknown buckets/layouts, overlapping public/private scope, incomplete/nonadvancing/foreign page cursors and omitted version identity refuse. Explicit `"null"` versions remain exact identities. Approved catalog membership binds bucket/key/version and SHA-256 of version-specific streamed bytes; ETag is metadata. All-version, delete-marker and multipart inventories reach terminal wire pages before planning.

Storage binding includes operation, reservation, owner, candidate, closure generation, exact staging project/environment/internal endpoint, storage epoch, configuration digest and approved reference digest. The caller must be the eventual qualified controller adapter; a supplied digest is not independent approval authority. The journal stores immutable plan/digest and intent/completion for each exact abort/delete. Current journal authority is rechecked after external admission and around each request. Lost replies re-list and reconcile only subsets. New identities, changed references, HTTP200 per-item errors or contradictions refuse. Two exhaustive final inventories precede completion; completion replay is observation only. The AWS bridge constructs only allowlisted SDK commands and bounds each call. No production transport/client or controller activation is wired to it.

API startup now defers business imports until after the maintenance branch. Selecting reset executor mode, including malformed input, cannot fall through to business startup. The existing maintenance listener admits only exact staging operation/reservation/candidate/generation and Railway identities, reports maintenance readiness and refuses business/operator routes. This validates local admission and compile behavior. Environment admission alone does not establish durable lease authority, artifact/environment snapshot semantics or absence of business child processes on an actual host.

Existing row/Redis implementations are unchanged. The only remote-program change re-exports the independent storage boundary. Existing quiescence observer, token/session semantics, target/origin guards and CLI activation refusal remain intact.

## Actual verification

The original controller 2 missing-entrypoint and storage 4 missing-export failures are genuine behavior RED, but exercised no later invariant. The API import/package failure is SETUP. Its configured build prerequisites and subsequent malformed-admission RED, 1 FAIL/1 PASS, remain in [the original receipt](reset-current-20261029/api-red.txt). Dependency setup made no tracked lockfile change.

Additional genuine RED receipts expose the drain-time horizon race, rejected explicit storage binding, wrong-target admission and skipped page cursor. The explicit-binding RED initially stops at binding validation; journal-contention assertions become exercised only in GREEN. These distinctions are retained in [raw-log provenance](reset-current-20261029/implementation-log-manifest.json). Receipt copies normalize surrounding/trailing whitespace; original raw-file digests are retained.

Literal functional commands and outcomes:

```sh
node --test --test-name-pattern='OT-CLOSE-CURRENT-1|current closure' scripts/staging-control.test.mjs
# 3/3 PASS
node --test scripts/staging-control.test.mjs
# 46/46 PASS, 57985.56ms
node --test scripts/staging-clean-reset-storage.test.mjs
# 7/7 PASS, 62.92ms
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/common/media-conversion-maintenance.spec.ts
# 2/2 PASS, 357ms configured duration
node --test scripts/staging-clean-reset-remote.test.mjs scripts/staging-quiescence.test.mjs scripts/staging-clean-reset.test.mjs
# 159/159 PASS
pnpm --filter @auto-tm/api exec eslint src/main.ts src/common/media-conversion-maintenance.ts src/common/media-conversion-maintenance.spec.ts --max-warnings=0
pnpm --filter @auto-tm/api typecheck
pnpm --filter @auto-tm/api exec tsc6 --noEmit
pnpm --filter @auto-tm/api build
```

All listed static commands exit zero. Node syntax checks passed for changed controller/storage/remote/fake modules. `git diff --check` passed. Contracts and DB generation/build prerequisites were already completed in the RED slot using the inert localhost:1 database URL; their exact logs remain at the base receipt. `AUTO_TM_TEST_DATABASES=off` prevents configured global DB/Redis setup. No broad CI, deployed acceptance, actual workload measurement or live experiment is claimed. The final storage-only cursor fix followed its own genuine RED and reran all seven storage tests; it does not change controller/API source.

Source SHA-256 values are in [the source manifest](reset-current-20261029/implementation-source-sha256.json). Boundary fakes are external provider/storage/time/ledger implementations; they do not qualify real platform semantics.

## Remaining gates and parent handoff

The [reserved experiment contract](reset-current-experiment-20261029.md) remains the concrete next operational work, after independent review and parent resource/reservation handoff. Implement and qualify real provider desired-zero/termination semantics for all current instances and automatic paths. Journal the actual maintenance-host transition, artifact/entrypoint/environment snapshot and restart identity, prove no business imports/providers/child processes, and retain exact authenticated fixed-program transport. The local controller currently consumes a qualified baseline; it does not implement that hosted transition. No new IAM hold or immunity from deliberate administrator reservation breaches is required.

Inspect actual existing storage issuance/configuration and signing-clock authority. A universal seven-day or source 900-second horizon is insufficient for SigV2 absolute expiry or future-dated V4. Unknown actual horizon remains closed. Qualify same-service old-process/socket termination after proven strict expiry, including accepted PUT/multipart and proxy/direct paths. Then bind the storage journal adapter and approved reference membership to that verified closure and repeated live inventory. Full public/private endpoint and configured scope qualification remains external evidence, not an inference from this fake.

The parent-owned lawful row dependency is proposed at `ed694833:docs/evidence/issue-897/r7g-recovery-20261029/operational-reset-row-proposal.md`, not implemented. It must atomically compare schema/content plus exact immutable closure binding, dispose exact authorized scenario inventory using the reviewed lawful protocol, and preserve guards/reference/configuration with same-operation receipt and lost-reply recovery. No TRUNCATE shortcut, CASCADE, trigger disable or role grant is selected here.

Approved reproducible reference overlay/reconstruction, ordinary authentication/readiness, reopening and late-object/stale-job checks, latest-main restoration and durable final release are still unimplemented/unproved operational phases. This checkpoint proves neither product erasure nor disaster restore. Parent owns final assembly, fresh Standards/Spec review, applicable CI and acceptance. No PR or integration publication was performed by this writer.
