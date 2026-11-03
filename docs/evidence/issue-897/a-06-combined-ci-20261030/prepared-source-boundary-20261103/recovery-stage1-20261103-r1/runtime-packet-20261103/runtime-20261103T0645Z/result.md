# #938 stage-1 runtime terminal handoff, 2026-11-03T06:45Z

Candidate/source input: packet `69d6b1042faa7e2b929358846e0c47d2473588d1`, non-doc source unchanged from `94ad0134a5d5ec03beb70a69746054637f0e937b`; executor `045f249ef9d44bb72cf8d390cc9a31911c6d7985`; tree and packet admission are recorded in #938 comments 6597279326 and 6597092217.

The fresh preflight passed: 1,636 tracked pins, 3,457 compiled pins and 102 migration pins matched; the executor was clean; the resolved Compose configuration matched the reviewed SHA-256 `195168eb0fd52bd3e998ad5b2333c51a2eb59ab9ebd4859b163c1c08d4c99414`; no owned resources or listeners existed before launch.

Setup passed: Compose health and ports 61169/61168/61170, fresh base database `auto_tm_897_938_s1r1`, all 102 migrations applied and captured with finished/checksum equality. The exact stage command ran the seven named cases with `maxWorkers=1`, `passWithNoTests=false`, `NO_COLOR=1` and `NODE_OPTIONS=--import=tsx`.

The stage exited 1 after about 74.91 seconds. Vitest executed all seven cases and all seven failed. No case was skipped. Exact failures are preserved in `owned-output/stage-vitest.stderr` and stdout:

- repeated `prisma_close: Error: Called end on pool more than once` cleanup failures across the suites;
- `DiagnosticErasedPredecessorReaders` purge path received PostgreSQL `42501 permission denied for table measurement_state`;
- the partial-initialization control expected `938_partial_initialization_sentinel` but received `938_fixture_cleanup_failed` because cleanup also failed;
- the immutable-write control expected `meta.driverAdapterError` but the real Prisma adapter returned a `DriverAdapterError` with the same `P0001/diagnostic_identity_evidence_immutable` cause.

Bounded cleanup ran after the stage. The receipt reader failed closed because the seven receipts contained failure entries. Redis DB1 flush/zero, source/campaign residuals, S3 inventory, anchored database/role cleanup, Compose teardown and owned Docker residual checks exited 0. The port residual command returned exit 1 with empty output, meaning no listeners remained. No foreign `65379` resource was touched.

This is not a #938 or Milestone A pass. The packet-only contract is exhausted: the next repair needs a separately recorded bounded contract covering the helper/fixture/test boundary and, if confirmed, the role grant or production repository boundary. Preserve the exact source/test assertions, memory refusal, SQL guards, cleanup controls and original case count. Do not rerun the stage or broaden scope until Parent disposes that contract.
