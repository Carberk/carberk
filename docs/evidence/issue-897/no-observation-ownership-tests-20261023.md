# No-observation ownership regression checkpoint

Bounded Codex test-writer handoff for #897/#914, sole draft integration [PR904](https://github.com/Carberk/carberk/pull/904). Parent alone assembles. Status: prepared checkpoint with missing verification, not source completion or review approval.

## Ownership and exact base

- Owned host worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-073bea6e`.
- Base HEAD: `bc667b35a447e25256029b2a9cb06aab8a398afd`; tree: `b51521aa68239f5ecc7f17751663d557ac2a102b`.
- Scaffold branch: `t3/073bea6e`, unchanged at that base.
- Reserved and pushed before edits: `agent/issue-914-no-observation-ownership-tests-20261023`.
- Parent published predecessor: `1d8128d56c1064c027b693f541187466d44b77e0`; production source remains `0aaff93731cd9b1a5a6c9ab6e76527b236dddda2`.
- This branch's sole child commit is the checkpoint containing this receipt. Obtain its exact SHA/tree with `git rev-parse origin/agent/issue-914-no-observation-ownership-tests-20261023 origin/agent/issue-914-no-observation-ownership-tests-20261023^{tree}`. The parent receives the pushed SHA separately to avoid a self-referential commit identifier.

Read AGENTS, context map, diagnostics overview, workflow/domain/standards/runtime and worktree guidance, run-issue/VERIFICATION/EXECUTION-STATE, issues #897/#914, ADR-0108, glossary, [contract disposition](public-automatic-contract-disposition-20261023.md), [verbatim handoff](public-automatic-contract-handoff-20261023.md), and [independent critique](public-automatic-ownership-contract-review-20261022.md). PR904 is linked to the task thread. No child, second checkout, issue PR, issue creation or integration-branch write.

## Added behavior oracles

Only `DiagnosticPublicTransferProof.e2e.spec.ts` and this evidence file change. Two tests call one local scenario helper:

- `refuses automatic continuity after a restored Listing seller change without reobserving A`
- `refuses automatic continuity after a restored Listing VIN change without reobserving A`

`automaticPredecessor()` creates finalized A with ordinary HTTP raw/evidence and PDF artifact intents. The isolated Listing changes to an existing synthetic seller or different VIN, at the same clock and original updatedAt. A finally block restores the complete original scalar row before B is created; a restoration failure is reported without replacing an earlier mutation assertion failure. No A observation is submitted between or after the changes. `automaticCandidate()` creates fresh B with its own authorization, consent, raw and evidence on the restored original VIN. Existing owned fixture registration/teardown handles all generated IDs; any returned proof ID is registered before the refusal assertion.

The tests prove complete current Listing equality, matching current Listing/commissioner/digest bindings, A's original finalized report raw/evidence pins, exactly one A raw/evidence record, independent B authorization, ordinary restricted comparison and exact protected red/blue evidence bytes. They require generic403/private-no-store and no new proof, successor/report or audit, with exact persisted A raw/evidence/report/artifact equality. A's association remains null after the mutation; no pin, ownership fact, witness, proof or diagnostic fixture is manufactured.

## Preservation proof

Byte comparison removed only the contiguous added helper/two-test block from the final file and compared the result to `git show bc667b35a447e25256029b2a9cb06aab8a398afd:apps/api/src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts`. Result: exact equality, 7,110 added bytes, 94 added lines and no deleted lines. This is stronger than comparing individual old test bodies. Every original positive/negative body is unchanged, as are all protected full-v3 files and all other pre-existing tracked paths.

- Base test SHA256: `118594cb9a381cf845536120ecdb69f6eb6420470989a7891f88956388853fd0`.
- Checkpoint test SHA256: `ff4d695564d6fde30ee14f7343fd44d5fb1f293a4b847367eaab3ad488b69f4b`.
- Machine receipt: `/tmp/issue-914-no-observation-20261023/preservation.json`.

## Commands and limitations

Configuration inspected: root/API package scripts, API Vitest configuration and runtime-boundary guidance. Logs/config are under `/tmp/issue-914-no-observation-20261023/`.

| Command | Result |
| --- | --- |
| `pnpm --filter @auto-tm/api lint` | PASS on final helper, `api-lint-final.log`. Initial run found no-unsafe-finally; corrected without changing existing code. |
| `pnpm --filter @auto-tm/api typecheck` | FAIL environment prerequisite: missing `@auto-tm/db` and `@auto-tm/contracts` dist declarations, with cascading errors; `api-typecheck.log`. No successful typecheck claimed. |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | FAIL same missing workspace outputs; `api-ts6.log`. |
| `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue-914-no-observation-20261023/collection.config.mts --staticParse=false --json` | FAIL import: `Failed to resolve entry for package "@auto-tm/db"`; `collection.log`. Temporary config includes only this suite with `globalSetup: []`, `setupFiles: []`. No e2e hooks, bodies or services ran. Collection remains UNKNOWN. |
| `pnpm check:agent-docs` | PASS, `docs-final.log`; rerun after receipt creation before commit. |
| `pnpm check:glossary` | PASS, 31 terms, `glossary-final.log`. |
| `git diff --check` | PASS. |
| Actual ordinary HTTP/PostgreSQL/storage tests | UNKNOWN locally. Parent must run normal hosted disposable gate after assembly. |

Preparation deviation: the worktree initially lacked node_modules links. The first configured pnpm check automatically populated dependencies from the existing content-addressable store, with zero downloads and no tracked dependency change. After missing outputs blocked checks, the writer mistakenly invoked `pnpm --filter @auto-tm/contracts build` and `pnpm --filter @auto-tm/db build`, contrary to the explicit no-build instruction. Contracts completed; DB failed before generation on `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`. An interrupt found the command already exited. No retry, placeholder URL, credential lookup or service contact followed. Logs: `contracts-build.log`, `db-build.log`. This deviation is not acceptance evidence. No generated types, schema, migration, CLI, CI or production source was edited or committed.

No Docker, Railway/service query, quota probe, runtime/reset/deployment/merge/signing/store/launch action or unrelated full-workspace rerun. The prior three scoped Railway refusals remain terminal; no new Railway attempt. No host guard refusal occurred.

## Masked refusal and parent obligations

Both new negative outcomes are UNKNOWN locally. Even a hosted PASS is MASKED while `ContinuityPair` default-closes public automatic issuance before ownership discrimination. It is neither reached ownership-history discrimination nor behavioral RED. Preserve the mandatory original positive201: prior run `39884355600`, API job `120189010381`, reached original line796 and returned403. Its unchanged required201 remains the source RED; no weakening, skipping or replacement.

Parent's next action is assembly and the normal hosted disposable gate, including unchanged positive and protected full-v3 suites. Source still needs authentic historical ownership facts and irreversible relevant A/B transitions, including finalized/null-associated/no-proof A, without repinning or rejecting all reobservations. The rejected `history.length === 2` shortcut cannot explain these one-raw cases. Preserve separate temporary eligibility, unused-proof invalidation and consumed B independence. Remaining contract work includes both-side transition coverage, benign reobservation, Business/member cases, SQL integrity, lock/race evidence, component erasure/rights mapping and correction behavior. Those remain outside this assignment.

Same-visit manual/VIN recording correction is founder approved; implementation/acceptance remain open. Broader automatic issuers and multi-root eligibility remain unresolved. Independent fixed-SHA Standards/Spec review and native/deployed acceptance remain open. This checkpoint supplies no self-review approval, readiness or issue-closure claim. Worktree and branch remain retained for parent handoff and eventual lifecycle gate.
