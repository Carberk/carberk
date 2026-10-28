# Independent ownership expiry contract review

29 October 2026. #897 / PR904 Milestone A. Architecture consultation only, not assembled Standards/Spec acceptance.

## Decision

The governing contract permits deterministic bounded subbatches in separate prepared transactions. It does **not** require one atomic transaction for all 100 due grants in a cleanup invocation. Keep the logical selection of 100 grants, complete every selected root's closure in its transaction, and complete the separately selected independently due component work before a successful invocation returns. Preserve the original first-permission-refusal rollback and every original final-state assertion.

This permits a worker-local scheduling repair. It does not establish that any proposed partition fits the graph bound or finishes inside the original five-second test. Those remain acceptance blockers. Do not pursue registry metadata optimization as a cardinality fix. No specific retained dependency has been proved redundant enough to authorize graph deletion or a specialized replacement graph.

## Authority and inspected material

Read AGENTS.md, CONTEXT-MAP.md, coding-workflow.md, domain.md, coding-standards.md, the glossary, API/worker/diagnostics overviews, runtime guidance, ADR0109 and the relevant ADR0104/Feature50/Flow66 rules. Applied the unslop writing skill. No other agent or external research was used.

The prepared-source contract was read from `/tmp/897-r7c-immutable-inputs-20261025/897-b1-prepared-source-command-contract-20261023.md`; its SHA256 was independently checked as `c15455516d773fe55d5151035b4afceef9348099c60d51578826c38b5eac3725`. Read its independent architecture audit and `docs/evidence/issue-897/b1-kernel-matrix-20261024.md`.

Recovery source was inspected with git show at `223b7ef81770f315c357bee045b625b733363497`, including DiagnosticArtifactWorker.ts, DiagnosticWorkerPreparation.ts, DiagnosticWorkerOwnershipExpiry.e2e.spec.ts, the producer, and the recovery receipt. Inspected the original held test at `332f4b557cc48c90b4795921177842f2cc4f767d` and fixture change `d2d14258e84d3b9768b506a2130a463257774586`. Their provenance from published `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab` is recorded in the recovery receipt. The test diff from 332f to recovery adds phase/statement evidence, without changing the acceptance assertions. Worker Vitest configuration has no test-timeout override; the reported native criterion remains 5000ms.

Read the supplied R7g `registry-baseline.md` and `scope-offline-lower-bound.json` in `/Users/bagtyyar/.t3/worktrees/carberk/t3-630f4e85/docs/evidence/issue-897/r7g-recovery-20261029`. These are existing evidence, not new acceptance runs.

Only this report was written. No repository edits, tests, builds, service access, SQL execution, GitHub access or delegation occurred. The PDF-exclusive CPU window was respected.

## Why atomicity is per command

The prepared-source contract gives three direct rules:

- Lines 53 onward require prepare/work/finish in the supplied transaction, no nested transaction or retry, and rollback of all source/report/audit writes of a failed command.
- Lines 95-97 require complete retained closure, no truncation, and whole-command refusal for an over-limit connected graph. They explicitly allow existing worker candidate LIMITs to select roots, provided each selected root's affected closure is complete.
- The worker entry at line 135 says each selected expiry root prepares its full graph while preserving candidate limits and schedules. It does not prescribe one transaction for the entire candidate list.

The B1 matrix preserves 100 root/row, 1000 closure/effect and existing iteration bounds. ADR0109 requires complete OLD/NEW/retained discovery and deterministic locks before writes, component-only disposal, unchanged unrelated observations and minimum consumed retry bindings. None adds queue-wide transaction atomicity. The contract separately names account UoW and composed account purge atomicity; that stronger requirement must remain there.

The original held test is the decisive observable distinction. At 332f lines 123-160 it globally revokes UPDATE on diagnostic_ownership_grants **before** cleanup starts, expects that cleanup to reject, and compares every retained row and receipt with baseline. Then it restores UPDATE and calls cleanup once, requiring all 100 grants, their derived components and the independent component disposed, with controls preserved. There is no fault after a successful earlier ownership commit and no concurrent observer requiring all 100 to change at the same instant.

Therefore the first attempted grant transaction can fail before committing any effects, leave the independent phase unstarted, and preserve exactly the original refusal outcome. Its components/proofs/requests may have been mutated before the denied grant UPDATE inside that transaction, but all must roll back. Every later selected transaction is likewise indivisible. A failure after an earlier committed transaction leaves that earlier work committed. Calling the latter behavior queue-wide rollback would be false.

Current recovery source is evidence of implementation, not governing authority. DiagnosticArtifactWorker.ts:284-337 already separates request expiry, the 100-grant transaction, the independently due component transaction and proof expiry. The test deliberately empties request expiry first. Cleanup as a whole is already not one atomic transaction.

## Exact problem established by R7g

The existing restricted read-only baseline at 7f5738cb parsed the exact 100-grant command in about 736ms. Scope raised `diagnostic_source_scope_limit` after about 4492ms, before keys, effect preparation or receipts. No disposal or permission-denial assertion was reached. Unchanged retained rows therefore do not establish the deliberate permission rollback test.

The effective core is migration 20261024010000, with the disposal wrapper in 20261024030000 and effective component representation in 20261026015000. Its limit condition combines more than 100 iterations with more than 1000 graph keys. The runtime exception alone does not identify that branch. The separate offline retained-eight-table calculation establishes at least 1101 keys after the first pass, not an exact runtime graph count. Its 401 initial keys and 1101 lower bound already suffice to reject the assumption that the original 100-root aggregate necessarily fits 1000.

The command has null actor/session and no explicit User roots. Discovered User FK endpoints do not become inventory subjects. The 199 User endpoint keys and 99 centers/templates in the lower bound do not demonstrate all-User inventory expansion. Removing that supposed expansion is not a supported repair. Metadata lookup optimization cannot reduce this cardinality. No161 was applied.

## Concrete bounded implementation proposal

Authorize a repair confined to `apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts`, focused worker acceptance/race tests beside it, and a short evidence/handoff update. Keep the existing workerSource/workerPlannedRow API and the existing SQL disposal functions. DiagnosticWorkerPreparation.ts needs no new generic batching or lock-planning interface. Do not edit historical migrations, caps, production consent/admission rules or the ordinary producer to obtain a smaller graph.

A concrete first candidate is a fixed internal transaction width of 10 roots, with a logical workset still capped at 100 grants plus 100 residual due components. Ten is a provisional implementation choice to verify, not a new accepted capacity claim. The 1101 lower bound does not prove ten roots fit or establish the optimal width.

1. Capture the invocation's existing cutoff once. With ordinary unlocked reads, select at most 100 available due grant IDs. Order by rightsUntil and id to prioritize the oldest due work with a deterministic tie break. Select a separate at-most-100 due component ID list, excluding components whose grant is in this frozen grant list. This gives independent component work its own capacity instead of letting the selected grants' 100 derived components fill its slots. The reads create no receipt and acquire no resource locks. Retain only selected IDs between transactions, not stale expected tuples or derived scope.
2. Process all selected grant IDs in deterministic contiguous groups of at most 10, serially. Do not return after the first group and do not replenish the list during the invocation. A successful original fixture invocation still processes all 100 grants. Derived components are always the full set required by each selected grant, regardless of their count; ten limits intentions, not derived effects.
3. Each group opens a new outer transaction. Reread its selected roots and make the exact fixed erasure plans using workerPlannedRow. Discover the existing disposal scope for every root before preparation. Invoke workerSource once for the group's complete union. After the prepared prefix, revalidate every root's disposal scope and due/source state before **any** disposer in the group writes. Keep the existing rule that all scope checks precede effects which could shrink another root's graph. Execute the existing disposers and finish the receipt in that same transaction.
4. Only after all grant groups succeed, process every frozen residual component ID in similarly bounded outer transactions through the existing ownership_expire/component disposer. Read current tuples at that transaction's entry, prepare its full closure, then execute only its selected component IDs. The independent fixture grant remains available and unchanged while its component and first anchor are disposed. There is no direct grant UPDATE in this component-only phase.
5. Continue the unchanged proof/material/artifact phases. Cleanup's return remains the number of completed storage removals, so this fixture still returns zero. Do not repurpose it as an ownership count.

For a concurrent cleanup, a selected root already atomically disposed by the other worker can be recognized as terminal on reread. An unexpected source/due change or a change during preparation must use the existing preparation-changed refusal, with no internal retry or late lock extension. Never silently skip a still-available due root. A terminal skip must not conceal incomplete derived disposal.

Freeze IDs, but regenerate plans/scope in each transaction. If an earlier grant group removes a proof shared with a later group, the later group plans against the actual committed state. Reusing a scope snapshot or receipt from before earlier commits is incorrect. Each group includes its full retained relation/key/effect union, even when this locks another selected grant's references; only legitimate intended and derived effects may change them.

An over-limit group refuses as a whole. Do not catch a cap error after DML and retry smaller pieces, truncate references, apply effects without preparation, or skip the offending root. An individually over-limit connected closure remains impossible to dispose under this contract and must be reported. If the exact fixture's proposed ten-root groups do not fit, the coordinator must select a proved narrower fixed partition before another implementation candidate, not claim the original fixture accepted.

This deliberately keeps a small worker implementation. It does not add a scheduler, persisted cursor, generic partition engine, new SQL authority, second adapter or alternative kernel.

## Fairness, locking and failure semantics

Oldest rightsUntil then id prevents an endless stream of newer expiries from overtaking older healthy work. Each successful invocation exhausts its finite selected grant list, then its independent component list. A full grant selection consumes none of the independent component budget. New arrivals wait for a later invocation. There is no arbitrary omission of one of the original 100 or the independent component.

This fairness guarantee applies to successful work. A hard failure in an earlier grant group still stops the invocation before the component phase. Repeated failure on an oldest root can block later work. Do not claim unconditional starvation freedom or add skip/quarantine behavior without a separate explicit contract. Preserving the original global-permission refusal takes priority over performing component work after a denied first grant transaction.

No resource locks survive a group transaction. Every group uses the existing campaign/table/namespace prelude and complete physical namespace/key order, then row locks and fresh READ COMMITTED rediscovery. Serial group processing creates no cross-group hold-and-wait cycle. Concurrent workers and proof/capture/erasure writers still require the existing two-ended edge protocol and both-order race evidence. Sorting grant IDs alone is not the deadlock proof; the shared complete lock order is.

On a first-group permission refusal, roll back its grant/component/anchor/proof/request effects and receipt. Abort before the independent phase. With the original fixture's empty earlier phases, every original retained row remains equal to baseline. On failure in group N after groups 1..N-1 committed, those earlier groups remain valid and erased, group N rolls back completely, and later groups are unattempted. Reject cleanup visibly. A later scheduled invocation recomputes due work and resumes through ordinary idempotent predicates. Do not add automatic in-call retries or compensation that restores erased material.

At no time may expiry fencing rely only on cleanup having run. Existing execution-time grant/proof/consume checks remain active between group commits. A committed earlier erasure cannot create permission to use the not-yet-cleaned expired material.

## Exact required acceptance

1. Keep the existing DiagnosticWorkerOwnershipExpiry.e2e.spec.ts test intact, including all 100 distinct grant assertions, derived component assertions, independent component, two non-due grants, non-due component, proof/request expectations, raw/Order/report preservation, anchor mapping, zero receipts, first global UPDATE-revocation rollback and cleanup result zero. Keep the single native 5000ms test budget covering both refusal and accepted calls and their assertions. Do not split these into separately timed tests.
2. Keep all 102 ordinarily created Orders and ordinary grant/observation/proof commands. Retain the original producer120s, request5s and declared45s rights horizon, original provenance and held332f/d2 lineage. A future exact-source pin update supplements old provenance; it does not overwrite it. The existing producer success is a source/runtime prerequisite, not cleanup acceptance.
3. Add real restricted-role PostgreSQL coverage with a deterministic failure in a later grant group after an earlier group commits. Fault the database boundary without mocking repository collaborators or asserting helper call counts. Read back exact prior-group erasure, exact current-group rollback including mandatory trigger effects, untouched later roots/controls, and zero source/campaign receipts. Restore the fault and demonstrate complete remaining disposal, then an unchanged second successful invocation. This distinguishes per-transaction atomicity from an unpromised queue-wide rollback.
4. Add cross-group shared-proof/request coverage. Put its incident due grants on opposite sides of a known group boundary. Assert exact proof/request disposal, no stale-plan failure from our own prior commit, preserved immutable raw/report and consumed retry minima, and no foreign changes. Add a case with more than one derived component for a selected grant so a root-width limit cannot become component truncation.
5. Add oldest-work and independent-capacity coverage using literal IDs/ends. A full 100-grant workset plus an independent due component must finish in one successful invocation. Newer due arrivals must not replace selected work or consume the reserved independent slots. Also verify a component whose grant lies outside the selected grant100 can still expire on its own rights while its non-due grant/control data stays unchanged.
6. Preserve/add actual worker-versus-proof-use, capture/late-edge and second-worker races in both orders, using lock/barrier observations rather than sleeps. Assert either a complete serialized result or named stale-preparation refusal with the current transaction unchanged. In particular, do not permit use of expired material while later groups wait. No new deadlock retry policy.
7. Keep real over-limit connected-closure refusal coverage under unchanged100/1000/iteration limits and all-row rollback. Record actual full graph/effect counts for the proposed fixture groups on an authorized isolated runtime. No lower-bound calculation or fake substitutes for real preparation, completion and race evidence. Run affected configured compiler/lint/runtime checks only after the coordinator releases resources.

## Fixture-oracle disposition

I found no demonstrated contradiction between the existing ownership test's accepted outcomes and the governing contract. No correction to it is justified. The original 332f test title's “refused full queue” describes the actual pre-start global permission fault; its assertions do not establish a fault after prior successful commits.

If a newly added oracle demands all100 be in one receipt, or requires later-group failure to undo previously committed independent transactions, that adds a guarantee absent from this accepted criterion. The smallest proposed correction is to constrain that new oracle to exact rollback of the faulted transaction and retain exact whole-workset completion after successful cleanup. It must be paired with the later-group-failure/resumption and original first-refusal tests above. This review makes no such edit or waiver. An oracle that drops selected roots, relaxes final preservation, or lengthens five seconds would directly contradict the accepted criterion and must stay rejected.

## Specific unresolved objections and coordinator gate

- There is no measured complete per-group graph/effect inventory. The baseline lower bound establishes aggregate pressure, not singleton or ten-root feasibility. A single connected over-limit root cannot be repaired by this batching proposal.
- The original five-second test is a serious open constraint. More preparations introduce repeated parser/discovery/lock/finish work. Even an under-cap partition may be slower overall. Neither this review nor registry optimization proves native GREEN. The candidate must finish the original test without changed timing or reduced work.
- Later-group failure and cross-group overlapping proof disposal are newly exposed observable cases and need exact database evidence before acceptance. Keep the existing error mapping and receipt lifecycle; do not mask a partial invocation as successful.
- Independent work progresses after healthy grant work; persistent hard failures can block it. The proposal deliberately does not invent authority to skip roots. If uninterrupted progress through a permanently failing grant is required, that is an additional failure-policy decision, not established by this test.
- No exact retained FK/lock/effect is shown redundant. A graph specialization would need a path-specific proof covering OLD/NEW references, incoming late edges, invalidation, cascades, consumed bindings, campaign resolution and both race orders. Deleting center/template/User/Session/Listing dependencies merely to fit is not authorized.

Coordinator may choose the bounded worker-subtransaction implementation within existing acceptance authority. No founder question is needed to resolve the inference about queue-wide atomicity. Architecture eligibility is established; implementation performance, exact closure, races and final assembled Standards/Spec review remain open.
