# Accepted B1/B2 local assembly receipt

Status: BLOCKED for verified integration. Exact accepted batch reconstructed without conflicts; no source fixes, pushes or PR updates. Owned branch `t3/4f7da6ed`, worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-4f7da6ed`.

Base `0ca85a6276286278b49333cfa25e0cc99cd93166`. Accepted payload head `ae09c230ec17d9d96e18caaf5864f55884b9cdf7`, payload tree `116243013a6235b6c3b27977bf9855d0a48bf398`. The final receipt commit head/tree are recorded after commit in `/tmp/897-assembly-4f7da6ed-evidence/final-state.json`, avoiding a self-referential hash. Final delivery SHA/tree accompany the handoff.

## Original to cherry-pick mapping

| Original | Local cherry-pick |
|---|---|
| `4ae9a4ec62442d592d0de259661de96c784d5e6c` | `e75904b0531b85df1cef015057cef2bfc95504a7` |
| `4d2248085517a3e40b83619b57e30b047fc88131` | `169b6757b33b63fda6998667421366997b376254` |
| `2ffd715dba96918b50dea97347a061cd792cc190` | `dd388fc0a2a511af9491a932fe0881b73979dea0` |
| `21c3101eed9b0a952ecd984144ec85bfaa604b84` | `65009d31b3af75f254721d6d6a7eadeeb4bc09ff` |
| `3dc34d6048c25d64ba1faa1fdd9ce3727faaa04d` | `ae09c230ec17d9d96e18caaf5864f55884b9cdf7` |

No new B1 witness work was included. The 26 accepted changed files are listed exactly in `/tmp/897-assembly-4f7da6ed-evidence/accepted-files.txt`. This checkpoint adds only this receipt and the copied release ledger. The ledger was copied read-only from `/Users/bagtyyar/.t3/worktrees/carberk/t3-e6e4c507/docs/evidence/issue-897/release-blocker-ledger-20261023.md` with SHA-256 `5bad247486bcfc5cbfb85ea1b9254912245bbb7f096db39b47269a93ee12c47e` before the appended assembly section. The parent will reconcile its working ledger.

## Combined offline evidence

Evidence directory `/tmp/897-assembly-4f7da6ed-evidence`. Exact executable command arrays, exits, elapsed times and individual log paths are in `combined-commands.json`; `checks.py` and `checks-summary.log` preserve the runner and output. All checks used `AUTO_TM_TEST_DATABASES=off`. API focused tests used a temporary config with no global setup or setup files, matching the source owner's offline test scope. Worker tests used the repository config's explicit database-off path.

Preparation passed: `pnpm install --offline --frozen-lockfile`, then shared-package code generation/compilation with `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @auto-tm/db build` and `pnpm --filter @auto-tm/contracts build`. Logs are `install.log`, `db-build.log` and `contracts-build.log`. The placeholder supplies Prisma config only; no database connection, migration or application/native build was run.

| Check | Command | Result |
|---|---|---|
| `api-typecheck` | `pnpm --filter @auto-tm/api typecheck` | PASS |
| `api-tsc6` | `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS |
| `api-lint` | `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/application/testing/ownershipGrantHarness.ts src/modules/diagnostics/domain/OwnershipGrant.spec.ts src/modules/diagnostics/domain/OwnershipGrant.ts src/modules/diagnostics/domain/ports/DiagnosticIntakePort.ts src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.ts src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrant.application.spec.ts src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.ts src/modules/diagnostics/infrastructure/DiagnosticPublicBindings.ts src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts src/modules/diagnostics/presentation/DiagnosticClassifiedOwnership.e2e.spec.ts src/modules/diagnostics/presentation/DiagnosticIntakeController.ts src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts --max-warnings 0` | PASS |
| `worker-typecheck` | `pnpm --filter @auto-tm/worker typecheck` | PASS |
| `worker-tsc6` | `pnpm --filter @auto-tm/worker exec tsc6 --noEmit` | PASS |
| `worker-lint` | `pnpm --filter @auto-tm/worker exec eslint src/jobs/ExpireServiceContent.campaign.spec.ts src/jobs/application/testing/TerminalSupportRetentionDatabase.ts --max-warnings 0` | PASS |
| `db-typecheck` | `pnpm --filter @auto-tm/db typecheck` | PASS |
| `db-tsc6` | `pnpm --filter @auto-tm/db exec tsc6 --noEmit` | PASS |
| `contracts-typecheck` | `pnpm --filter @auto-tm/contracts typecheck` | PASS |
| `contracts-tsc6` | `pnpm --filter @auto-tm/contracts exec tsc6 --noEmit` | PASS |
| `contracts-lint` | `pnpm --filter @auto-tm/contracts exec eslint src/schemas/diagnostics-ownership-grants.spec.ts src/schemas/diagnostics.ts --max-warnings 0` | FAIL, exit 1 |
| `api-focused` | `pnpm --filter @auto-tm/api exec vitest run --config /tmp/897-assembly-4f7da6ed-evidence/unit.config.mts src/modules/diagnostics/domain/OwnershipGrant.spec.ts src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrant.application.spec.ts src/modules/diagnostics/domain/ContinuityPublicOwnership.spec.ts src/modules/diagnostics/domain/ContinuityPair.spec.ts` | PASS |
| `worker-focused` | `pnpm --filter @auto-tm/worker exec vitest run src/jobs/ExpireServiceContent.campaign.spec.ts src/jobs/CampaignSupportRetention.spec.ts src/jobs/serviceRetention.spec.ts src/jobs/S3RetiredObjectStore.spec.ts --reporter=dot` | PASS |
| `contracts-unit` | `pnpm --filter @auto-tm/contracts test:unit` | PASS |
| `db-offline` | `pnpm --filter @auto-tm/db test:offline` | PASS |
| `schema-static` | `node --test scripts/diagnostic-ownership-grants-schema.test.mjs scripts/diagnostic-classified-ownership-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs` | PASS |
| `runtime-imports` | `pnpm check:runtime-imports` | PASS |
| `agent-docs` | `node scripts/check-agent-docs.mjs` | PASS |
| `diff-check` | `git diff --check 0ca85a62 HEAD` | PASS |

API: 49/49 tests. Worker: 21/21. Contracts: 575/575. DB offline teardown: 5/5. Static schema/inventory/mirror: 3/3. Both TypeScript compilers pass for all four affected workspaces. Affected API/worker lint passes. DB has no changed TypeScript files requiring affected lint.

Blocking failure: `contracts-lint.log` reports `diagnostics-ownership-grants.spec.ts:1:1`, `import/order`, "There should be at least one empty line between import groups". ESLint exits 1 under `--max-warnings 0`. This file is unchanged from accepted source `2ffd715`; no ad-hoc repair or rerun occurred. All already-launched checks completed, and no expanded behavioral checks were selected after the failure.

`preservation.json` records byte comparisons against base. All 72 existing migrations and 38 existing retained SQL mirrors are unchanged. The new grant migration/mirror match through the static tests and schema inventories remain additive. `CampaignFullV3.e2e.spec.ts`, `ServiceLifecycle.e2e.spec.ts`, `CleanRetiredUploads.e2e.spec.ts`, `SafeReplacementScheduling.spec.ts`, `ContinuityPair.ts` and `PrismaDiagnosticContinuityProofs.ts` are unchanged. Automatic issuance's explicit `toBe(201)` assertion remains at line 897 of `DiagnosticPublicTransferProof.e2e.spec.ts`; its HTTP result was not executed. All accepted file contents match their source checkpoints; no existing assertion was removed by assembly.

## Remaining gates and limitations

Automatic admission remains CLOSED. The immutable first-anchor/witness prerequisite on both visits and complete OLD/NEW/retained source-writer locking remain pending with the source owner. Current compatible grants cannot establish unchanged historical ownership. Reviewer independence and dual-inspection restricted access, real SQL forgery/disposal/concurrency, hosted HTTP admission and exact-candidate review/acceptance remain unproved here.

B2 uses a simulated database refusal. It proves retained private-content outcomes through the real worker, not the SQL disposal predicate, PostgreSQL locks, reset races or operator quiescence. No old reset tail was retired. B3/B4 operator replacements and same-candidate reset evidence remain required. B5 remains RED/held at its exhausted cap with the unchanged 5,000 ms bound; no timing probe or repair ran.

No disposable service, SQL execution, full CI/rerun, deployment, reset, Railway/quota, device/emulator, native/application build, signing, store, merge, nested agent, push or PR mutation occurred. No host guard refusal occurred. Full repository gates and deployed/operator acceptance were excluded by the bounded authorization and remain parent-owned. Docs: no external dependency or service contract changed, so no external lookup was needed.


## Full PR history reconciliation, 2026-10-23

Read the complete point-in-time `/tmp/pr904-full-discussion-20261023.json`: body 73454 characters in five bounded slices, all 24 comments totaling 88976 characters, all status entries, and the empty formal-review list. Snapshot SHA-256 `df8d4a4caf19037960bee2642b9bbcd79d9f77858a66617b12c7c5aad273d67f`; per-comment URLs/content hashes and read ranges are in `/tmp/897-assembly-4f7da6ed-evidence/pr-history-audit.json`. Independent reports posted as ordinary comments were read, not omitted because `reviews` is empty. Before this follow-up, assembly had inspected the working ledger and targeted receipts, not all historical PR discussion.

No overlooked decision changes this exact source batch or justifies repeating prior repairs. The following details add historical disposition and release-gate context to the narrower assembly ledger, without claiming fresh runtime acceptance:

- [Review on ef85f17f](https://github.com/Carberk/carberk/pull/904#issuecomment-6246426564) and [review on 729f01ed](https://github.com/Carberk/carberk/pull/904#issuecomment-6246789350) retain Request changes verdicts for their original candidates. The later body and committed `review-round2-service-isolation-20261018.md` record fixes at `feed53d17a93816c2aa10e69f00aa50273c12110`, evidence pin `dde36c3cf69c7fe64d6dfb7fa0349b0d09287fce`. Account/conversation draft isolation and rejected pagination are prior repairs, not new B1/B2 work. Native and real browser interruption evidence were expressly not supplied by those component tests.
- [Lifecycle review on 287a6e93](https://github.com/Carberk/carberk/pull/904#issuecomment-6258444915) accepted durable-lease CLI closure and authority revalidation after asynchronous provider preflight as blockers. Existing inherited `617b1502e23f851996e0a86ffd2e3e9878589172` implements those source corrections in CLI/controller/adapter. Source/history inspection distinguishes this already-installed correction from the still-open operational acceptance gates; no new test or deployed proof was run. [The #658 review](https://github.com/Carberk/carberk/pull/904#issuecomment-6257329453) was for an explicitly unassembled historical candidate; the later [d3c03ebe disposition](https://github.com/Carberk/carberk/pull/904#issuecomment-6257614828) records its fixes, including current-error binding `bb9506de6f6afab68ba505727adc67de63ab7f72`. Those findings do not authorize another source slice here.
- [Storage review on 39211b43](https://github.com/Carberk/carberk/pull/904#issuecomment-6257302237) and [later d3c03ebe review](https://github.com/Carberk/carberk/pull/904#issuecomment-6257614828) expressly leave whole #901/#897 BLOCKED despite bounded source PASS. Durable complete-disposal, same-operation continuation, exact live identity/schema/readiness, post-main observation/restoration and actual deployed/native authorization remain required. The current ledger captures missing operator acceptance, but its B1-B5 table is not an exhaustive substitute for those earlier unresolved release gates. Historical storage-only refusal wording belongs to those pins; it does not negate later clean-reset source already present in base.
- [Exact96c reset-tail disposition](https://github.com/Carberk/carberk/pull/904#issuecomment-6328317360), SHA `96c0c844cdfed5a0e5f1ce658e6788ea65d14f90`, requires equivalent product/operator proof on the same candidate before tail retirement. The current body orders API/worker GREEN before deployed reset. This sequencing conflict is already in the ledger and remains unresolved; B2 fake refusal cannot resolve it. Retain old tails and security/isolation/erasure/private-byte coverage. The prelaunch reset direction supersedes preservation-only historical machinery, not product coverage or operator proof.
- [Static renderer proposal](https://github.com/Carberk/carberk/pull/904#issuecomment-6353587881), SHA `c2d681bcc84ced709208985796b26f0993125925`, explicitly selected no production architecture. Later body entries record the implemented privacy projection/safe-replacement work and its remaining hosted limits. It is not an outstanding instruction to rebuild rendering. [Earlier erasure test preparation](https://github.com/Carberk/carberk/pull/904#issuecomment-6353293847), SHA `01e2af19126e1fcaf52326aedf7eae86a7493d79`, likewise precedes later source and exact-SHA outcomes. Do not confuse preparation, setup failures, genuine RED, or older GREEN with current acceptance.

The body preserves the rejected mutable-Listing shortcut `f0824f32` / `9c7f7a6f`, reverted `07d328ea`, and three related B1 source iterations; no additional repair budget follows from repeated RED observations. B5's exhausted cap and unchanged 5,000 ms bound stand. Prior P2028 later did not recur; its cause remains unknown. Prior founder approvals remain settled.

The saved current status is draft at `0ca85a6276286278b49333cfa25e0cc99cd93166`: API/pr FAILURE, DB/frontend/static/lane/runtime SUCCESS, docs SKIPPED. This is the parent's fetched snapshot, not a new query/run and not acceptance of this local assembly. Known published B1-B5 failures remain unchanged. No extra fixes/features/checks or CI were started for the history audit.

## B1 design-only continuation receipt included

Parent explicitly permitted the append-only docs checkpoint `1968e55f54fd708e8fdd6148fef1da6171cf5f7d`, cherry-picked cleanly as `0ee6539b` after the original five source checkpoints and assembly receipt. Only `public-automatic-b1-contract-checkpoint-20261023.md` changes. It adds no witness/source/schema/assertion change or automatic 201 fix.

The inventory identifies a source-visible lock inversion: account restore can hold collector/Listing before User, while deletion can hold User before collector. No deadlock was executed. Callback-shaped account UoWs, Business outgoing-owner discovery, caller-owned moderation transactions, Listing trigger side effects and worker erasure require a complete outer prepared-source-command/lock contract before a cross-context source batch. The same B1 owner now has DESIGN ONLY work. No witness was implemented, no historical anchor backfilled, automatic admission stays CLOSED, and the required201 remains retained. Existing combined source evidence still applies because only documentation followed it; no new behavioral verification is claimed.
