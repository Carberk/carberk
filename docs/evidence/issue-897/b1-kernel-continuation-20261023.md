# B1 kernel continuation, held substantive checkpoint

Status: NOT READY for kernel acceptance. This continuation authored code and executable real-PostgreSQL scenarios. It did not complete the approved kernel contract. Do not integrate, activate, start callers or select hosted CI on this receipt alone. This is an implementation shortfall, not missing founder consent, policy ambiguity or an impossible design. No automatic replacement/retry round is requested or authorized by this receipt.

Owned checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-731f77ca`, branch `t3/731f77ca`, accepted starting commit `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`, starting tree `6dd9c3f2401d556a97ba7377a2a5dd96f2b56d6d`. First substantive preservation commit `4a8230e0` includes the initial kernel, schema, export and SQL suite. Final source checkpoint and tree are recorded in the companion `/tmp/897-b1-kernel-continuation-20261023-handoff.md` after committing this receipt.

The complete design's SHA-256 was checked and equals `c15455516d773fe55d5151035b4afceef9348099c60d51578826c38b5eac3725`. The four audit corrections, current parent ledger, recovery contract and earlier no-code/held outcomes were read. No held implementation was cherry-picked or treated as accepted. Parent checkout and its sole uncommitted ledger were read only. Historical attempts remain earlier three related iterations plus `90cc679d` / `9f45ee9f` / `40ead201`, followed by stopped no-code `778f962a`; this continuation does not reset those caps.

## Authored source

- `packages/db/src/diagnostic-source-command.ts` exports preparation/work/finish in a caller-owned transaction, opaque receipts, explicit assertions and first-slot seal. It creates no transaction or retry and has no fallback preparation.
- `packages/db/src/diagnostic-source-tables.ts` enumerates physical keys for 77 registered source/dependency tables. Composite and non-id PKs are explicit.
- `packages/db/prisma/migrations/20261023130000_diagnostic_source_kernel/migration.sql` installs the immutable registry, operation parser and typed normalization, graph discovery from actual persisted rows, root-only subject expansion, per-table disjoint advisory namespaces, sorted physical keys and row locking, separate post-lock rediscovery, opaque INSERT preparation, direct DELETE final-effect checks, live deferred receipt completion, pending NEW-order shells, immutable first-slot claims, narrow observed-identity initialization, sticky identity/member/commissioner transitions, erasure composition and dormant strict guards.
- Its retained mirror is byte-identical. Schema/profile entries are additive. Historical migration and retained SQL files are unchanged. The former grant-only inventory test now pins its original exact schema snapshot; all its assertions remain.
- `packages/db/tests/diagnostic-source-kernel.e2e.spec.ts` authors 20 actual SQL cases after parameter expansion using migrated disposable PostgreSQL and real connection/lock barriers. No local SQL execution occurred. Existing original positive/negative/automatic201 tests and timeout/config files were not edited.
- `scripts/diagnostic-source-kernel-schema.test.mjs` checks mirror/profile compatibility and physical PK/schema/TS-key agreement. These are static inventory checks, not PostgreSQL proof.

[The full operation/caller/table/key/FK/scenario matrix](b1-kernel-coverage-20261023.md) identifies all six future caller groups and exact missing coverage.

## Exact blockers to kernel readiness

1. The campaign prelude is implemented only inside source preparation. A separate complete persisted-ownership prelude for excluded ordinary User/Session/settings/media writers is missing. There is no enforcement rejecting an actual namespace outside such a separately prepared set. The existing campaign scripts and authority/hash contracts were not changed or run.
2. Strict guards currently cover dependency tables/columns too broadly. They would require source receipts for ordinary Session creation, scalar dependency/media and lease-only operations that the approved design excludes. They remain disabled; preparation explicitly refuses `diagnostic_source_dormant` until all generic guards are active. No activation DDL is shipped. Effective row guards run AFTER ROW to see BEFORE-trigger effects; this differs from the approved BEFORE ROW ordering and is not presented as accepted.
3. Server effects cover Listing association and unused-proof invalidation, shell/first-slot completion and ownership-anchor disposal. They do not yet derive every account purge cleanup/attribution-null effect, center/template/bootstrap write, mandatory audit or proof/request/FK cascade. Some remain caller-declared exact plans and others fail closed when the guard finds them uncovered. The account purge operation is enumerated, but that is insufficient to certify its full existing erasure union.
4. The executable suite is a substantive subset of the required finite SQL matrix. Missing families are listed explicitly in the matrix, including complete grant-use/expiry/revoke, retained proof/report edge, absent OWNER, campaign/scalar, account/service/upload/collector, foreign-isolation and FK-cascade races. No placeholder/comment/string match is counted as a scenario or as SQL evidence.

Consequently the current source cannot honestly be called protocol-complete or accepted for caller expansion. This source checkpoint preserves useful work while those concrete obligations remain unfulfilled. The parent owns disposition; no next writer/run/continuation is selected here.

## Checks and limitations

| Command | Result |
|---|---|
| `pnpm install --offline --frozen-lockfile --ignore-scripts` | PASS, installed existing locked workspace dependencies; no lockfile change or bootstrap scripts |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db generate` | PASS; dummy non-listening URL used only to satisfy config; no connection |
| `pnpm --filter @auto-tm/contracts build` | PASS, required built runtime dependency |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build` | PASS, generated client and CommonJS output |
| `pnpm --filter @auto-tm/db typecheck` | PASS, configured TypeScript 7 |
| `pnpm --filter @auto-tm/db exec tsc6 --noEmit` | PASS, configured TypeScript 6 |
| Focused ESLint on the new DB source, physical-key types, index and SQL spec | PASS after routine development fixes; first development invocation found nonnull test assertions and import spacing, corrected without disabling rules |
| `node --test scripts/diagnostic-source-kernel-schema.test.mjs scripts/diagnostic-ownership-grants-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs` | PASS 4/4; inventory only |
| `pnpm check:runtime-imports` | PASS DB/contracts CommonJS/ESM boundary |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/OwnershipGrant.spec.ts src/modules/diagnostics/domain/ContinuityPublicOwnership.spec.ts src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrant.application.spec.ts` | PASS 41/41 across three existing offline suites; no SQL proof |
| pglast 7.21 `parse_sql` / `parse_plpgsql` over the entire forward migration | PASS, 50 top-level SQL statements and PL/pgSQL grammar; no relation/type planning, trigger execution or concurrency proof |
| `git diff --check` | PASS |

The first generation/typecheck attempt ran before generated/built dependencies existed: generation refused missing `DATABASE_URL`; typecheck reported missing generated/client/contracts artifacts plus the initial test PID typing. Codegen then used a dummy URL, contracts were built and tests read actual backend PIDs through SQL rather than relying on an untyped driver field. A temporary pglast parser was installed under `/tmp/897-sql-parser`; no project dependency or version changed. This parser establishes grammar only.

SQL red/green execution was intentionally not attempted because the task explicitly prohibits local SQL, Docker and services. Therefore the repository test-first SQL red checkpoint is missing, and hosted SQL/HTTP acceptance is UNKNOWN. The new SQL suite has only compiler/lint/grammar preparation, not a passing real execution. Docs: internal-only source/SQL work, no runtime dependency/API upgrade; installed package types and existing repository APIs were used.

## Scope preserved

Automatic admission remains CLOSED. No production callers, domain/adapter admission, bootstrap execution or full fixture/caller phase was changed. Real customer authenticated seller/current business OWNER grants, exact current rights, expiry/revocation/use-time checks and ordinary automatic201 remain required. SQL grant fixtures are not customer consent. There is no legacy anchor backfill, observer/config/worker hash repin, equality/history-count witness, new retention period or generic transaction-creation framework.

B2–B4 accepted base source is unchanged. B5 observer modules/config/pins are untouched; its one approved future measurement remains unused. No full CI, integration push, PR904 mutation, deployment/reset/reseed/Railway action, signing/build artifact, service/HTTP environment or device/emulator action occurred. Only the owned checkpoint branch may be pushed after verifying it has no PR and push workflows are main/tag-only. Parent remote PR remains the supplied `0ca85a62` RED; it was not inspected as fresh hosted evidence here.
