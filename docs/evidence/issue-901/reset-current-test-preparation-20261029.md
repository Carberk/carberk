# Current closure test preparation

This is a test-only preparation checkpoint from clean `889d724d63b5c0872df8f58982b5deb9712ccff0`. The accepted independent report was read in full at `/tmp/candidate-a-reset-exclusion-contract-review.md`. Test checkpoint `6972c244` and experiment-contract checkpoint `d448d511` are pushed on the same owned branch `agent/issue-901-candidate-a-reset-20261029`. No production behavior has changed since 889.

The coordinator assigned runtime in this order: R7g's current final focused interval, R6c's prepared static/original five-second native test, then an explicitly announced finite controller/storage/API RED window for this writer. This checkpoint reserves no idle CPU or runtime. No test, compiler, parser, package install/build, SQL, container, CLI/configuration read or live mutation ran during source preparation. The new tests are **unexecuted**, not RED. Missing dependency/binary/fixture/compile failures will be recorded as SETUP when that window opens.

Prepared interfaces and outcomes:

- `scripts/staging-control.test.mjs` adds OT-CLOSE-CURRENT-1 through the real `StagingControl` and real local Git CAS ledger. The existing `FakeStagingPlatform` gains detailed provider desired-region maps, business and maintenance instance/boot identities, qualified automatic-path semantics, storage epochs/accepted requests, actual issuance horizon and external clock epoch/ticks. Lost stop reply reconstructs the controller from the same ledger; automatic restart, unknown horizon, accepted-request survival and changed authority must refuse without row/Redis/object effects. Only exact invariants may reach inventory-ready. No fake merely returns `held:true`.
- `scripts/staging-clean-reset-storage.test.mjs` specifies the fixed remote boundary's collector and object recovery exports. One S3 wire fake uses actual version/upload marker pairs, explicit null versions, version-specific bytes, all eight configured logical families and preserved out-of-scope bytes. It exercises unknown scope/prefix, marker failure, equal-ETag changed bytes, HTTP200 item errors, lost abort/delete replies, subset reconciliation, immutable plan/no enlargement, changed binding/authority and observation-only completed replay. No caller `complete` flag establishes collection authority.
- `apps/api/src/common/media-conversion-maintenance.spec.ts` specifies exact staging reset-executor startup admission at the existing maintenance server boundary. It uses Vitest's environment boundary with the existing zero-argument server interface, so missing behavior can fail without an argument-count compile error. Invalid target/candidate/maintenance mode and extra binding fields must refuse; valid maintenance continues to refuse both business and operator routes. Static imports and actual absence of business processes remain implementation/runtime obligations, not proven by this test.

The [private experiment contract](reset-current-experiment-20261029.md) pins exact target/service IDs, current CLI operation forms, original configuration/replica baselines and restoration, admitted maintenance-host transition, provider automatic-path qualification, actual issuance/clock horizon, same-service accepted-request drain, exhaustive storage recovery and the parent-owned lawful row-reset dependency. Its command examples were not executed. No helper service, public operator route, credential rotation, bucket-policy change, public database exposure or product/kernel bypass is selected.

Next literal focused commands, after the explicit START and any ordinary setup prerequisites, are:

```sh
node --test --test-name-pattern='OT-CLOSE-CURRENT-1|current closure refuses' scripts/staging-control.test.mjs
node --test scripts/staging-clean-reset-storage.test.mjs
pnpm --filter @auto-tm/api exec vitest run src/common/media-conversion-maintenance.spec.ts
```

Execute these serially and preserve actual failure attribution before production changes. Then implement the accepted controller/storage/admitted-host contract and rerun affected cases. Existing rows/Redis recovery and the legacy observer refusal stay intact. No new source or runtime acceptance, production reset activation or staging handoff is claimed. Worktree and branch remain preserved for the same writer; no DB/port/container/session or credential artifact was created.
