# Issue #881 source GREEN and B1 mutation evidence, 2026-10-20

Base `78f750c6` (docs-only successor of `0eefa49d`; executable source identical). Branch `agent/issue-881-source-20261020`. Source commit `83f46854bf5da3b82915f1faee30d96eee65cb82`.

## O3: ThumbHash backfill deleted-Message predicates

Genuine hosted RED on `0eefa49d`: [DB 118641828711](https://github.com/Carberk/carberk/actions/runs/39426922332/job/118641828711) passed 32/33 files and 324/326 tests. The two failures in `packages/db/tests/backfill-thumbhashes.e2e.spec.ts` reached persisted real-PostgreSQL readback. At line 177, an image Message deleted during a successful download acquired `thumbHash`. At line 203, a `post_ref` Message deleted between its fresh candidate read and the actual UPDATE acquired `coverThumbHash`. The other five cases passed.

Source change: `packages/db/scripts/backfill-thumbhashes.ts` adds `"deletedAt" IS NULL` to the image `thumbHash` and the `post_ref` `coverThumbHash` Message UPDATE predicates. The id, key, existing-hash guards, Listing media UPDATE, reads, object-storage behaviour, conversion refusal and interfaces are unchanged. No test, schema or dependency changed. This enforces the documented rule that deleted Messages stay untouched, so the DB overview is unchanged.

Local checks (logs in `/tmp/carberk-881-source-20261020/`):

| Check | Result | Log |
|---|---|---|
| `pnpm --filter @auto-tm/db typecheck` | pass | `db-typecheck.log` |
| focused `eslint --max-warnings 0` on the backfill script, unit spec and e2e spec | pass | `db-focused-lint.log` |
| `vitest run scripts/backfill-thumbhashes.spec.ts` (mocked pg; no real-SQL claim) | 12/12 pass | `backfill-unit.log` |

Setup only: the fresh worktree needed `@auto-tm/contracts` and `@auto-tm/db` builds, plus `prisma generate` with the CI unreachable `DATABASE_URL`. See the `setup-*.log` files. Neither Docker, PostgreSQL, Redis nor staging was used. GREEN for the real-SQL e2e file is predicted at 7/7, with DB at 33/33 files and 326/326 tests. Root runs that hosted check.

## B1: production adapter mutation sensitivity

The earlier receipt in the #881 writer comment covered only a literal-administrator lookup mutation (five failures). Its logs were no longer on disk, so a bounded proof was rerun in this worktree. Command: `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/infrastructure/PrismaIdentityCheckAdapter.spec.ts`.

| Run | Temporary change to `isAdmin` | Result | Log |
|---|---|---|---|
| baseline | none | 13/13 pass | `b1-baseline-green.log` |
| wrong return | `row?.role === "admin"` → `row?.role !== "buyer"` | 4 fail: missing, moderator and seller refusals, and supplied-id lookup (`expected true to be false`) | `b1-wrong-return-red.{log,diff}` |
| wrong id | `where: { id: userId }` → `where: { id: "admin" }` | 3 fail: admits administrator, re-reads changed role, and supplied-id lookup (`expected false to be true`) | `b1-wrong-id-red.{log,diff}` |
| restored | `git checkout` of the production file | 13/13 pass | `b1-restored-green.log` |

The production file's SHA-256 `5f9724639b7542bae7fe11625593d8619c5f738dead27f94a0219819d8d9d8f6` matched before and after, and `git diff` was empty. No mutation was committed. Hosted [API 118641828783](https://github.com/Carberk/carberk/actions/runs/39426922332/job/118641828783) on `0eefa49d` passed 13/13 for this spec. The membership and phone tests were retained. The #445 elevation boundary was not touched.

## O1: MinIO discovery

Hosted [frontend/root 118641829023](https://github.com/Carberk/carberk/actions/runs/39426922332/job/118641829023) on `0eefa49d` completed with SUCCESS. In the plain log, lines 14227–14285 show the configured `test:root` command, with each of the eight MinIO contract cases passing once. Lines 15234–15242 show discovery passing 2/2. Root totals: 423 tests, 422 passed, 1 existing skip, 0 failed or cancelled. Inclusion in the whole-suite `pnpm test` entry rests on the discovery test plus the prior local 10/10 run, not on a hosted full `pnpm test`.

## Remaining gates

- Hosted exact-head DB run proving the unchanged e2e file GREEN at 7/7.
- Independent Standards and Spec review.
- Applicable exact-head hosted CI.
- Protected integration delivery under #897/PR904.
