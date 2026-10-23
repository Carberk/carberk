# Continuity request clean-reset manifest fix, 2026-10-23

This receipt records the bounded #901 manifest correction on integration PR #904. The hosted DB run `run39946417121` / job `120390590869` reached 38 passing files (381 tests) and 3 failing files (11 tests). Its direct failure was `Clean reset refused: Unknown live table public.diagnostic_continuity_requests`; the remaining cases were setup-blocked. Raw log SHA-256: `aa387c1ebdd91af6d4c79068f5a4d8d632872e6bfcc5bae52b290f98928c75a0`.

The recovery migration `20261023110000_diagnostic_continuity_requests/migration.sql` creates the disposable `public.diagnostic_continuity_requests` table and six exact triggers: `diagnostic_continuity_proofs.diagnostic_issued_request_binding`, `diagnostic_continuity_proofs.diagnostic_request_proof_deleted`, `diagnostic_continuity_requests.diagnostic_request_immutable`, `diagnostic_reports.diagnostic_consumed_request_binding`, `diagnostic_reports.diagnostic_request_report_deleted`, and `inspection_orders.diagnostic_request_order_erased`. The manifest now classifies that table as `delete` and pins those six identities. The five triggers on existing tables remain admitted as migration-owned triggers. No wildcard or broad admission was added.

Test-first evidence is preserved. Checkpoint `1402f46fdfe3be8e828505e6dcd159839e077339` is test-only and the focused test was red because the manifest omitted the new table and trigger identities. The same test is green on the follow-up implementation checkpoint. The added coverage reads the migration SQL, builds a live-shaped inventory, passes it through `planTables`, and separately proves unknown table, altered trigger, foreign-schema trigger, and truncate-trigger refusals.

The existing focused test body is byte-identical through the prior final byte; coverage is appended only. No DB e2e file, source module, schema, migration, reset planner, Redis code, or runtime assertion changed. No new retention or preservation behavior was introduced.

## Verification

| Command | Result | Log SHA-256 |
| --- | ---: | --- |
| `node --test scripts/staging-clean-reset.test.mjs` (test-only checkpoint) | 1 | `5b54c7f7ec10171241ee64001a8d8099878340c91a847d991b4efc5368301b83` |
| `node --test scripts/staging-clean-reset.test.mjs` (manifest fix) | 0, 22 passed | `a2928bfc5cd4389c951704f724407ce5089385cff155c63474fcfeda13b4b779` |
| `node --check scripts/staging-clean-reset.test.mjs` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node scripts/check-agent-docs.mjs` | 0 | `aecc3fad493f95385b2eb915f12a25975582dfc392a5f942fea2eecbcf8cf7db` |
| `node scripts/check-domain-glossary.mjs` | 0 | `2e05fa0133022f990bd0007c0ce14a7141e5ad8e3bcf7bc68332b987daceaf09` |
| `git diff --check b49ca212129aa153fcf1f5c6eb2a6591ef91a90c` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Real SQL/Redis acceptance remains unknown until hosted CI reruns. This worktree did not run DB/e2e, Redis, Docker, HTTP, browser, device, infrastructure, reset, deploy, or CI polling commands.

The preservation audit compared all 249 tracked `packages/db` files with parent `b49ca212129aa153fcf1f5c6eb2a6591ef91a90c`, including 11 DB e2e files, and verified the original focused test is an exact byte prefix. Existing assertions and fixtures required no edits. The first auxiliary audit failed on Git-quoted Unicode paths; the second completed the DB comparison but named a nonexistent standalone Redis file. The final audit uses NUL-separated paths and the actual reset modules. Both failed audit logs are retained alongside the successful proof.

Logs, per-command exit codes and hashes are in `/tmp/carberk-901-manifest-20261023/commands.jsonl`; the DB e2e hash inventory is `db-e2e-sha256.json` in that directory. The final handoff hash manifest also covers the receipt, diff, checkpoint identity and push evidence. Parent branch reservation was pushed before edits; the test-only checkpoint was pushed before the manifest correction. The original host scaffold was `t3/ff626596` at the supplied parent and remains unchanged.

Docs: no external lookup needed. No dependency, API contract, glossary term, ownership boundary or overview limitation changed. Broader repository/package gates are intentionally not run under the dispatch's explicit no-listener command limits. The parent owns incorporation, independent review, hosted SQL/Redis acceptance and publication. The three refused Railway paths and capped worker repair remain terminal. No new PR or integration push occurred.
