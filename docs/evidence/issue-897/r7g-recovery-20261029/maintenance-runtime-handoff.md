# R7g isolated runtime checkpoint, 2026-10-29

This checkpoint is partial local capability evidence, not final acceptance or activation. Parent coordinator owns assembly and independent Standards/Spec review. No public/store/staging actions occurred.

## Source and loaded provenance

Started at `f98abfe747a66010af1f303870ec9bb2ce15d6d8` in the existing owned checkout. The first real original-suite run reached 9 PASS / 6 FAIL. Historical98 migrations and Prisma schema remain unchanged; no161 exists. The only additive migration is `20261026016200_diagnostic_maintenance_compatibility`. Current99 manifest SHA256 is `4a3315f44edfb6dc0533f0134ae0274ff031482a8b86437aac2d65cfacc61d52`;162 SQL SHA256 is `41f9c26ac199d7b75fa4f857972dbfd93e946801d4f8cb4cb04604c1a0908dfa`.

Both original databases loaded that manifest and the same effective diagnostic/campaign SQL function-definition hash `84aa421782c354b8911da50683f1e48f4f5b0f89f63ff91a6f65be687f88761d`. Restricted cases independently checked the99 applied checksums and captured V8 loaded-source hashes. Exact source pins, every result path/hash and migration manifest are in [maintenance-runtime-results.json](maintenance-runtime-results.json). Private connection/config/server-query artifacts remain mode600 or task-local and are not copied into repository evidence.

## Repairs and reached evidence

- Original database suites: fresh replay,15/15 PASS, no skips. Promotion role/audit exactness, audit rollback, dry-run/no-op, original phone/email serialization and original tester ownership/removal assertions all reached GREEN. The expanded final run reached17/18 with one setup failure because the retained tester database already held its original catalog slug. Next original run must use fresh task databases. Promotion assertions passed in that expanded run.
- SQL42702 firstRED identified `diagnostic_source_lock_keys` line7 and `diagnostic_source_account_effects` line8: PL/pgSQL variables collided with SQL aliases. Valid reviewer plans then proved another42702 in `diagnostic_source_parse` line36. Renamed only local variables and retained exact predicate behavior. A subsequent missing renamed reference42703 was preserved and corrected.
- Email dry-run/no-op first failed because Prisma cannot deserialize PostgreSQL `void`. Cast the unchanged advisory lock result to text. No lock/budget/authority change.
- Real reviewer rotate/revoke first reached device `diagnostic_source_effect_mismatch`: Prisma changed protected device `updatedAt` outside the prepared tuple. Derived device effects and the adapter now bind that field to the same transaction/audit timestamp. Focused valid parser/compound/fence rerun4/4 PASS.
- Expanded restricted36 reached35 PASS / one MinIO setup failure from the earlier run's retained bucket. The exact isolated fixture now restores bucket absence; the real MinIO convergence, metadata stripping, displayName convergence and foreign/private byte checks subsequently PASS in a focused rerun. The fixture teardown change still needs a full-suite rerun.
- Real compound reviewer cases pass owned Session/video-grant/service-push cascading cleanup, active-device invalidation, contact-free audit, unchanged foreign security state, and whole-plan rollback when Session deletion, device update or audit insertion fails.
- Both promotion start orders pass. Canonical-email promotion-first excludes a concurrent case-variant holder with exact server40001 / `diagnostic_source_user_insert_busy`; creation-first causes promotion to refuse without role/audit effects. Initial missing test import is recorded separately as setup failure.
- The held exact insert-fence assertion initially failed because Prisma maps40001 to P2034 and hides the server message. Coordinator approved the same restricted-principal PostgreSQL INSERT boundary; the server SQLSTATE/message and whole-state assertion remain exact. No production error contract changed.
-75 scalar tests PASS, including all original eight outcomes, protected-field matrix and displayName convergence. TS7, TS6, affected lint and configured DB build PASS before the final fixture-only refactor. No post-checkpoint source change inherits those results.

Literal original invocation: `pnpm --filter @auto-tm/db exec vitest run tests/promote-admin.command.test.ts tests/tester-accounts.e2e.spec.ts --maxWorkers=1 --reporter=json --outputFile=<task receipt>`. Restricted invocation substitutes `tests/maintenance-finite.r7g.e2e.spec.ts`. Task wrapper `/tmp/897-r7g-runtime-20261029/rerun.cjs` supplies private isolated URLs, optional `R7G_PATTERN`, and `--fresh` recreates only the two original task databases. Per-suite configured120s/60s limits and command transaction limits were unchanged.

Configured build: `DATABASE_URL=postgresql://build:build@127.0.0.1:1/build pnpm --filter @auto-tm/db build`. Checks: `pnpm --filter @auto-tm/db typecheck`, `pnpm --filter @auto-tm/db exec tsc6 --noEmit`, affected `eslint ... --max-warnings 0`, and the four original scalar files listed in the earlier verification plan.

## Accepted continuation and remaining evidence

The reached real second-revoke RED is preserved: first revoke succeeds, second refuses its own cleared verification fields. Coordinator accepted exact tombstone repeat closure under runbook80 and contract61. Recognize only fixed ID/slot role, exact `revoked:<id>` phone, null email/emailVerifiedAt, exact `Revoked <id>` displayName, nonnull retained phoneVerifiedAt, no suspension/deletion schedule. Clean whole-roster repeats with no Sessions/active devices must be write-free with empty IDs. Mixed/dirty repeats must prepare one complete fresh closure and revalidate the whole roster; no skipped cleanup. This checkpoint contains the failing behavior test and receipt; its source-only repair follows separately.

Keep original tests and every reached RED. The earlier scheduling interpretation is corrected append-only: NOW is Oct7 and the original Oct20 schedule advances; preserve original two schedules/counts and the additional Oct6 earlier-date protection. No assertion/budget/cap waiver occurred.

Required follow-up remains: clean/dirty/mixed repeat and whole-list failure proofs; full post-repair restricted/original/scalar/compiler/lint checks; transitive continuity-proof/consumed-report retry retention; opposing contact/Session/device/purge/Listing/business/proof races in both orders; normal HTTP sign-in/refresh, pending-deletion/AdminGuard/TOTP/staff/diagnostic-unavailable checks and independent assembled reviews. Unreached cases are UNKNOWN. Local SQL/adapter results do not establish deployed availability.

## Resource release

Exclusive window RELEASED. Project `candidatea-r7g`, PG60936/MinIO60937, no Redis. Only task promotion/tester/control databases were used; no shared ports or ownership7 access. All scoped client PIDs drained; per-case DBs/roles removed; both original databases have source/campaign receipts0/0. Own PG/MinIO containers are STOPPED with retained task data. No runtime/build/compiler/test may start until the next coordinator window. Next original bootstrap must recreate its task databases to avoid retained catalog fixtures. No source/schema/guard changes were made in another owner's resources.
