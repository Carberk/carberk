# B1 staff-bootstrap fixture correction, 2026-10-24

Fixture-only checkpoint for the parent's independent finding-scoped check. Parent owns kernel source acceptance. This receipt awards no source, Standards/Spec, SQL/runtime or release acceptance.

Founder instruction "$chief-of-staff go on finish and preapre the first test candiate i allow you to run autonimously and prepare it" authorizes the concrete pending fixture proposal and targeted independent check. The proposal's pending status is historical. This writer dispatch ends at verified handoff, with no nested agents, caller expansion, cap reset or operational authority.

Base is `7725c1c52e49c3b5242262f287a2f48ff8dfc4de`, tree `9f9c4e18d6c6c754df52c029b8381e4962409cfb`. Owned checkout is `/Users/bagtyyar/.t3/worktrees/carberk/t3-5a125af6`. Initial status was clean at accepted parent `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`; scaffold `t3/5a125af6` is preserved there. Branch `agent/897-b1-bootstrap-fixture-20261024` was reserved and pushed at the exact held correction before edits. Exact checkpoint/tree/push/clean results are in `/tmp/897-b1-bootstrap-fixture-20261024-handoff.md`.

Read the full proposal and unapplied patch, latest independent source reassessment, prior source-correction handoff and parent disposition, approved source-command contract and four architecture overrides. Read AGENTS/CONTEXT-MAP, coding workflow, run-issue/resume/worktree/model guidance, standards/runtime guidance, DB overview, relevant glossary and owning source. No new policy/design decision was needed. Docs: no external dependency/service change; no external lookup required. No overview ownership or boundary changed.

## Finding and exact response

The inherited P2 affected the two modes of the declaration at [diagnostic-intake-effects.e2e.spec.ts:127](../../../packages/db/tests/diagnostic-intake-effects.e2e.spec.ts). The command declares truncated millisecond `next.grantedAt`, but the negative INSERT used the physical default, which rounds TIMESTAMP(3). At a UTC transaction fraction `.123400`, declaration and default are both `.123`; at `.123600`, declaration is `.123` while default is `.124`. In the latter case the exact source-row guard can raise `diagnostic_source_effect_mismatch` before either intended completion path.

The negative transaction now materializes `targetCommand(tx)` once, reads `next` from its existing first row, and uses `grantedAt: new Date(String(next?.["grantedAt"]))` in the staff INSERT, exactly as the existing positive callback does. At both `.123400` and `.123600`, declared and explicitly inserted values are `.123`. This removes the default-rounding divergence without a production precision change or timestamp tolerance. These are static expected values, not executed SQL observations.

The target User, capability, command, roots and intent are unchanged. The callback still deliberately omits the mandatory audit. In delete mode, the otherwise exact INSERT is followed by the original explicit receipt DELETE, whose completion checks require the absent audit. In finish mode the callback returns to the unchanged wrapper, which calls `diagnostic_finish_source` and the same receipt DELETE checks. Both still require exactly `diagnostic_source_final_effect`. Source inspection covered the wrapper, staff parser/audit derivation, physical grant DDL, effective row guard, exact tuple assertion and receipt completion checks. No earlier-error alternative is accepted.

The rollback null-readback, full positive audit-plus-INSERT callback, audit UUID derivation, persisted grant/count readbacks, active replay and final equality/count assertions are byte-for-byte unchanged. The entire file outside the proposed replacement is byte-for-byte unchanged. No new cases, case removal, matcher widening or timeout change occurred.

## Offline evidence and integrity

Writer-run checks only, all exit 0:

- `pnpm install --offline --frozen-lockfile --ignore-scripts`, local dependency setup.
- `pnpm --filter @auto-tm/contracts build`, required local declarations.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`, local ignored Prisma generation and compilation, no database connection.
- `pnpm --filter @auto-tm/db typecheck`, configured TypeScript 7.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit`, configured TypeScript 6.
- `pnpm --filter @auto-tm/db lint`, full configured DB lint, including affected file, zero warnings.
- Python byte comparison against the supplied patch and base, historical inventory arithmetic, unchanged suffix and all migration/mirror SQL files; full diff/control-flow inspection; `git diff --check`.

Logs are `/tmp/897-b1-bootstrap-fixture-20261024-{install,contracts-build,db-build,ts7,ts6,lint}.log`. Static comparison is `/tmp/897-b1-bootstrap-fixture-20261024-static-audit.json`. Fixture SHA-256 is `62a0b31d686ec7d46c94b52d67ef8e075afbc6298c0608aa6f4378a32e3f802d`.

All production source, SQL, schema, owners, admission, permissions, locks, guards, migrations and retained mirrors are unchanged against held7725. All 125 migration/mirror SQL files at that base are byte-identical. Only the fixture and this new receipt change. Historical receipts and JSON submission records remain unchanged. The historical scenario inventory still records 103 declarations / 224 authored SQL cases: kernel120, purge37, intake8, campaign32, API27. This exact callback replacement changes no declaration or expansion. Its three added lines move only the final intake declaration from line166 to169; this additive receipt records that location correction without rewriting the historical inventory.

SQL cases executed: **zero**. No suite was imported or executed. Red/green SQL execution is prohibited by the task-specific restriction; compiler/lint and static inspection do not prove PostgreSQL behavior. No unrelated tests or full CI ran.

## Remaining gates and preservation

Parent must inspect exact provenance/diff, obtain the one authorized independent finding-scoped read-only check and decide kernel source acceptance before caller work. The prior report's seven corrected source dispositions carry forward as prior evidence, not a fresh full-source review. Final Standards/Spec, coherent source/caller batch checks and CI, hosted SQL/HTTP/concurrency/role/profile acceptance, deployed acceptance/restoration and release gates remain pending. No first test candidate or automatic HTTP201 success is claimed here.

Original90cc/9f45/40ead/no-code778f and66aaa/38ec/scopedf1/incompletea67/scopedf8/held9efe/correction7725 dispositions, failed acceptance, interruptions and caps remain intact. Accepted parent stays9bcb; published PR904 candidate stays0ca85a6276286278b49333cfa25e0cc99cd93166. B2-B4 stay LOCAL. B5 stays held3510963655a90b1389e85a2e6847d6d6bbd4aec0, its single observation UNUSED, cause UNKNOWN and cap exhausted.

No SQL/HTTP/Docker/service/device/emulator/screenshot/native build/signing/store/deployment/reset/reseed/Railway/operator bootstrap/merge action occurred. No issue PR, integration/published branch push, parent ledger write, other checkout write, review dispatch or self-acceptance occurred. No host guard refusal or semantic ambiguity occurred. Stop at the pushed checkpoint and handoff.
