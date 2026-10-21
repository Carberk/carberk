# Diagnostic reader lineage labels, 2026-10-21

Implementation handoff for bounded D4 under #914/#916, parent #897 and sole integration PR #904. Root owns GitHub execution records, review, integration with `cherry-pick -x`, hosted CI and acceptance. No child agents or issue PRs were created.

## Ownership and scope

Base: `c704d02a0880d9f8284c7354fefd9cacc3e3219c`. Owned worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-f41e9b70`. Host scaffold branch `t3/reinspection-reader-labels` started at that base. Reservation branch `agent/issue-916-reinspection-reader-labels-20261021` was created and pushed at the supplied base before edits. The first push failed with `CONNECT tunnel failed, response 503`; the next push succeeded. The final handoff supplies the checkpoint SHA and tree after this note is committed.

Read AGENTS, context map and affected overviews, coding workflow/standards, runtime boundaries, domain, mobile/Expo, UI-MODE, NativeWind and mobile-testing guidance, glossary, diagnostic feature 50/flow 66 and the linked historical proposal/source/incremental disposition. No diagnostic-specific wireframe or hifi spec exists in the searched UI directories. This is current-reader copy conformance to root's explicit approved D4 decision, with no layout or navigation redesign. Broader acceptance remains open.

## Change

The live report contract adds optional `lineageKind` (`original`, `correction`, `reinspection`) and `successorKind` (`correction`, `reinspection`). Missing or unrecognized kinds remain unknown and readers use neutral newer-report/reason labels. A reason's user-entered text never determines kind. Current kind comes from persisted `reinspection` and `predecessorId`.

The existing successor disclosure helper now returns id and kind together from its one existing successor lookup. Its filters and same-order correction, commissioner and public gates remain intact. Hidden or draft successors return `supersededBy: null` with no `successorKind` property. Public and authenticated DTOs use this projection. No authority, lookup route, lock, migration, state mutation or admission rule is added.

Both readers use successor kind for the next link and current lineage kind for the reason. Explicit corrections retain existing correction labels. Reinspection copy is exactly root-approved EN/RU/TK. Neutral copy is EN `Open newer report` / `Reason`, RU `Открыть новый отчёт` / `Причина`, TK `Täze hasabaty aç` / `Sebäp`. These reuse repository report/open/reason vocabulary, including `Sebäp` in mobile resources. Previous-report destinations and native public/private audiences remain unchanged.

Both live metadata fields are explicitly omitted from `DiagnosticReleasedSnapshotSchema`, alongside the existing successor id omission. The contract test compares serialized parsed release output with and without live metadata and checks the stored schema shape. Snapshot writing, hashing and PDF rendering source are unchanged.

## Executed RED before bounded source implementation

After building the unchanged base contracts with `pnpm --filter @auto-tm/contracts build`:

| Exact focused command | Result |
| --- | --- |
| `pnpm --filter @auto-tm/contracts exec vitest run src/schemas/diagnostics.spec.ts` | 3 failed, 2 passed. Live kinds were stripped. |
| `pnpm --filter @auto-tm/web exec vitest run src/diagnostics/Reader.spec.tsx` | 6 failed, 12 passed. Reinspection and legacy reason/link labels asserted correction wording. |
| `pnpm --filter @auto-tm/mobile exec vitest run src/diagnostics/DiagnosticReader.spec.tsx` | 12 failed, 17 passed. Same mismatch through real hooks/components and MSW for both audiences. |

Logs: `/tmp/reader-contract-focused-red.log`, `/tmp/reader-web-focused-red.log`, `/tmp/reader-mobile-focused-red.log`. RED tests were run before production edits; no separate RED commit was pushed. The final checkpoint includes tests and source together.

Earlier attempts used `pnpm --filter <workspace> test -- <file>`, which Vitest treated as broad runs rather than file filters. Contracts: 3 failed/563 passed; web: 5 failed files/12 passed files, 6 failed/123 passed tests; mobile: 221 failed files/133 passed files, 1169 passed tests. Missing built contracts caused import failures in those broad consumer runs, so they are not claimed as behavior RED. One native test syntax error was fixed before the focused behavior RED above. All processes completed; none were left live.

## Executed GREEN and checks

Initial exact focused commands above passed after implementation: contracts 5/5, web 18/18, native 29/29. Coverage was then expanded for unknown kinds, original-kind neutral reasons and mixed lineage where a reinspection has a correction successor.

| Exact command | Final result |
| --- | --- |
| `pnpm --filter @auto-tm/contracts exec vitest run` | 21 files, 567/567 tests pass, including 6 lineage contract cases |
| `pnpm --filter @auto-tm/web exec vitest run src/diagnostics` | 2 files, 34/34 tests pass |
| `pnpm --filter @auto-tm/mobile exec vitest run src/diagnostics` | 3 files, 50/50 tests pass |
| `pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts` | 4/4 existing renderer tests pass |
| `pnpm --filter @auto-tm/contracts build` | pass, pinned dependencies |
| `DATABASE_URL=postgresql://unused:unused@localhost:5432/unused pnpm --filter @auto-tm/db build` | pass, client generation only, no service connection |
| `pnpm --filter <workspace> typecheck` and `pnpm --filter <workspace> exec tsc6 --noEmit`, for `@auto-tm/contracts`, `@auto-tm/web`, `@auto-tm/mobile`, `@auto-tm/api` | all pass, TS7 and TS6 |
| `pnpm --filter @auto-tm/contracts exec eslint src/schemas/diagnostics.ts src/schemas/diagnostics.spec.ts --max-warnings 0` | pass after adding import-group spacing |
| `pnpm --filter @auto-tm/web exec eslint src/diagnostics/Reader.tsx src/diagnostics/Reader.spec.tsx src/diagnostics/copy.ts --max-warnings 0` | pass |
| `pnpm --filter @auto-tm/mobile exec eslint src/diagnostics/DiagnosticReader.tsx src/diagnostics/DiagnosticReader.spec.tsx src/diagnostics/copy.ts --max-warnings 0` | pass |
| `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/infrastructure/DiagnosticReportAccess.ts src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts src/modules/diagnostics/infrastructure/PrismaDiagnosticPublic.ts src/modules/diagnostics/presentation/DiagnosticReports.e2e.spec.ts --max-warnings 0` | pass |
| `CI=1 EXPO_OFFLINE=1 pnpm --filter @auto-tm/mobile exec expo install --check` | dependencies up to date; CLI warns offline validation is unreliable; configured TypeScript exclusion retained |
| `CI=1 EXPO_OFFLINE=1 pnpm --filter @auto-tm/mobile exec expo export -p ios --clear --output-dir /tmp/issue-916-ios-export` | pass, static export only; log `/tmp/issue-916-ios-export.log` |
| `git diff --check` | pass |

## Acceptance limits

All three locales exercise explicit correction/reinspection, legacy missing and unknown metadata, neutral wording, mixed current/successor kinds, unchanged previous/next navigation and hidden successor labels. Native tests use real components/hooks with MSW, exercise both public/private audiences and preserve existing session/PDF/withdrawal cases.

The existing focused reinspection HTTP case receives only additional assertions. All original case bodies and assertions remain. Added assertions cover original/reinspection/correction current kinds, no draft metadata, visible successor id plus kind, withdrawal hiding both id and kind from public/staff, and the successor commissioner's retained disclosure. These assertions are **unexecuted locally** and need root's hosted PostgreSQL/storage CI. API typechecks/lint do not prove authorization at runtime.

No Docker, local services, native device session, staging, Railway/provider/credential action, CI polling/wait/rerun/dispatch or gh API call was performed. Full repository, native runtime/visual light/dark layout, deployed reader and PDF/open-share acceptance remain root-owned and open. The iOS export and component tests do not establish visual layout or installed-native behavior. No claim is made that D2/D3/D5 or broader reinspection/service readiness is complete.
