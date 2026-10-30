# A51 clean-reset refusal diagnostic, 2026-10-21

Bounded implementation checkpoint for #901 under #897, for root assembly into sole PR904. Base `42b07ffac9d4bf8148ba39eee75ef9f4aafa4add`, above published `a51bf6cf`. Reused the supplied host worktree, initially clean on scaffold `t3/issue-901-a51-refusal-diagnostic`. Reserved and pushed `agent/issue-901-a51-db-refusal-diagnostic-20261021` at the base before editing. The containing commit identifies the delivered head. No PR or GitHub content was created or updated.

## Existing hosted evidence

The supplied PR Checks run `39622886246`, DB job `119300813250`, reports 370/371 passing tests. The one failure is the completion-identity mismatch assertion at the original `packages/db/scripts/staging-clean-reset.e2e.spec.ts:334`. Its label is exactly `reservation`, with code 1, no receipt and `refused: false`. This is the second mismatch in source order, after `operation`, before `candidate` and `environment`. The actual `outcome.failure` and child status are absent from that assertion's output. Reaching this point establishes that earlier deletion and retained-state assertions in this test passed; it does not establish the later no-write checks or replay assertions.

Inspected local artifacts under `/tmp/carberk-resume-20261021/`:

| Artifact | SHA-256 |
| --- | --- |
| `a51bf6cf-db-119300813250.raw.log` | `796f26b7a795942b0239c867e79426341a4b83f3f31c42b3c2c77747a8cdfe5b` |
| `a51bf6cf-db-119300813250.raw.plain.log` | `d6b8aac4016244cac2a0c73e87369068a263c80ddfd2b8c4e218057b41f5dce3` |

The dispatch's raw hash matches the raw artifact, rather than its plain derivative. API 1/1 and worker 369/369 for the new identity-history source, and the three older API reset tails, are dispatch context, not newly collected evidence. This checkpoint investigates only the separate DB signal.

## Source diagnosis and remaining hypotheses

Inspected the [test wrapper](../../../packages/db/scripts/staging-clean-reset.e2e.spec.ts), [serialized remote program](../../../scripts/staging-clean-reset-remote.mjs), its embedded [planner](../../../scripts/staging-clean-reset.mjs), and [disposable query helper](../../../scripts/testing/query-disposable-postgres.cjs).

The reservation mutation changes only `reservationId`, leaving the original operation ID and runtime identity intact. The generated read-only observation selects the stored receipt by operation ID. After inventory validation and planning, its reservation comparison should refuse with `Clean reset refused: Clean-reset operation identity changed`, before reaching any deletion transaction. The changed-operation case selects no receipt and should instead encounter the old inventory digest. The two original accepted refusal strings remain exact and unchanged.

Before the receipt comparison, the remote program can refuse on database transport, extra backends, inventory/operator-schema validation or planning. Its SQL wrapper collapses a spawn error, nonzero child exit or marker count other than one into `Clean reset refused: database operation failed`. The test substitutes a fresh synchronous Node child for psql, with an existing 30-second timeout; the remote psql configuration has an existing 300-second timeout. The helper opens a fresh pg connection, submits the entire multi-statement SQL string, prints returned row values, closes the client and uses a generic error message on failure. Its existing opt-in diagnostics emit only SQLSTATE and bounded numeric positions. This test previously neither enabled nor retained that metadata.

Root cause is not demonstrable from the available log. Plausible distinctions are a child timeout or spawn/buffer failure, a PostgreSQL rejection, a response-marker failure, or a semantic refusal before receipt identity validation, including a backend visibility race after settling. None is confirmed. Earlier successful inventory, deletion and the operation mismatch do not support declaring a persistent schema regression. No schema or runtime fix is proposed.

## Diagnostic change and safety

Only the owned test and this note change. The mismatch assertion now supplies Vitest failure context containing the production-sanitized failure string, query count and ordered subprocess observations. Each observation contains exit status, termination signal, a fixed allowlisted spawn error code or `other`, marker count, and at most one independently allowlisted SQLSTATE/position line from the first 8,192 stderr characters. Absent optional values are omitted by JSON serialization. Array order identifies the SQL invocation without SQL text. No new SQL or subprocess call is added, and the original spawn result is returned unchanged.

The remote catch and planner refusal paths were inspected before exposing `outcome.failure`. Connection stderr is suppressed by production; unexpected exceptions receive its fixed suppressed message. Expected refusals contain fixed classifications and catalog identifiers, not credentials or SQL rows. The generator catch in this test uses the fixed generator and synthetic payloads. Raw child stderr, error messages/stacks, SQL input, returned rows, connection values, environment, and receipt contents are excluded from the added context. The helper's existing diagnostic flag is enabled only for these disposable test children. Successful assertions emit no added diagnostic output.

All expected values, accepted refusal strings, authority/identity guards, snapshot/file no-write assertions, test order, retries, sleeps, budgets and timeouts remain unchanged. No production source, schema or manifest changes. The mismatch still fails if the refusal classification is unexpected.

## Offline verification and limits

| Criterion | Evidence | Result |
| --- | --- | --- |
| Original oracles and timing preserved | TypeScript AST comparison against `42b07ffa`: all 95 expect subjects/matcher argument records, explicit timeout/buffer properties, and query/settle/snapshot/files/run helpers unchanged | Pass |
| Affected-file lint | `pnpm --filter @auto-tm/db exec eslint scripts/staging-clean-reset.e2e.spec.ts --max-warnings 0` | Pass |
| Affected-file types | `pnpm --filter @auto-tm/db exec tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node --strict --skipLibCheck --noUncheckedIndexedAccess --noPropertyAccessFromIndexSignature --noImplicitReturns scripts/staging-clean-reset.e2e.spec.ts` | Pass |
| Workspace lint/types | `pnpm --filter @auto-tm/db lint`; `pnpm --filter @auto-tm/db typecheck` | Blocked by missing contracts build and generated Prisma modules, with cascading workspace type errors. No affected-file error. Typecheck log at `/tmp/issue-901-a51-db-typecheck.log` |
| Documentation and patch hygiene | `pnpm check:agent-docs`; `git diff --check`; manual review of this note's source links and complete diff | Pass |
| Actual hosted classification and no-write proof after this failure | Requires a future root-owned hosted execution | Unknown, not run |

The first focused compiler command required adding the installed compiler's `--ignoreConfig` flag when specifying an explicit file. pnpm materialized 634 cached packages with zero downloads on its first invocation. No dependency/configuration or generated source files were edited. Docs: internal source inspection only; no changed external dependency/API requiring a lookup. Overview ownership and product behavior are unchanged.

No local services, Docker, database, Railway, credentials, CI dispatch/poll/wait, agents, expensive script suite or hosted rerun was used. Test-first runtime proof was not attempted because this assignment authorizes diagnostic preparation and offline lint/typechecks/docs/diff only. The new failure message has not been observed in a hosted run. Root owns integration, any subsequent runtime assignment and disposition of a fix requiring another file. This checkpoint supplies diagnostics, not a verified repair or acceptance completion.
