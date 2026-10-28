# Service usability recovery, 29 October 2026

Writer checkout: `/Users/bagtyyar/.t3/worktrees/carberk/t3-aed62215`.
Branch: `agent/issue-897-service-usability-20261029`.
Base: `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab`.

## Authority and bounded decisions

The recovery brief selects current-scope conformance for #897/PR904. No prototype redesign, new request capability, API/schema/kernel/worker change, reviewer delegation or PR creation is authorized for this writer. The coordinator owns browser/native/deployment acceptance resources.

Governing references: ADR-0103 business membership and invitation access; ADR-0104 private inspection audiences and retained report history; ADR-0106 synthetic preparation versus commercial activation and classified rights; `docs/prd/features/53-vehicle-history.md`, `docs/prd/flows/68-service-requests.md`, `docs/prd/ui/service-workspace.md`; existing Cabinet wireframe/hifi grouped rows and existing `SafeScreen`, `StackHeader`, `useSafeBack` patterns. This is trivial conformance to those existing controls, not a new visual design.

Accepted coordinator steering: neutral Vehicle History discovery without an unconditional price/payable/public activation claim. Preserve authenticated existing history, server-validated admitted tester commands and denial/recovery. Do not infer server-only synthetic admission, introduce an availability/config contract or globally assert unavailability because a projection is missing.

Planned repair: keep Cabinet `/(tabs)/services`; move customer service workspace to `/service-requests`, update History, Support including auth intent, workspace auth return and push callers. Independent notice and close-awaiting body/reason drafts. Explicit staff-entered real/synthetic source, rights basis/provenance and History expiry/reason under the existing rights schema; Support keeps its approved 90-day-after-close schedule. Reuse current navigation controls for the six affected task screens, with safe direct-entry fallback. Preserve business invitation access for authenticated people without membership.

## Recovery and resource state

Read the prior backing thread and stopped worktree read-only. Its branch has no committed delta from the supplied base; the inspected service directory has no salvaged delta. Provider 429 is not a behavioral verdict. No git command or write was run in that worktree.

R6c timing-sensitive interval was ACTIVE at dispatch. Source inspection and regression test drafting only so far. No tests, compiler, install, Metro, browser, device, DB or Docker session has been started. This fresh checkout has no `node_modules`; `pnpm install --frozen-lockfile` and contracts build are prerequisites for genuine test red. Production code remains unchanged until that red is observed and preserved.

## Next exact proof

After coordinator resource release:

1. Install frozen dependencies in this owned checkout; build `@auto-tm/contracts`.
2. Run single-worker focused admin `ServiceWorkspace.recovery.spec.tsx` and mobile `HistoryEntry.recovery.spec.tsx`, `service-navigation.recovery.spec.tsx`, the new `ServiceScreen` denial/history case and Account entry case. Fix only setup errors before accepting red.
3. Preserve real red checkpoint, implement bounded repairs, run the same tests green.
4. Run focused neighboring mobile/admin tests, affected-file ESLint and both workspace TS7/TS6 typechecks. Record actual results. Broad/export/native/browser gates remain coordinator-scheduled.

No red/green, implementation completion or acceptance is claimed by this draft checkpoint. Missing availability projection remains an explicit contract/evidence gate for any richer audience/activation behavior, not an excuse to infer it from tester status.

Docs: not applicable. Internal route/form repair reuses installed repository components and contracts without changing dependency APIs or versions.

## Observed red, before production edits

Coordinator released R6c interval. `pnpm install --frozen-lockfile` passed, followed by `pnpm --filter @auto-tm/contracts build`.

- `pnpm --filter @auto-tm/admin exec vitest run 'src/app/(admin)/services/ServiceWorkspace.recovery.spec.tsx' --maxWorkers=1`: 3 failures. Closure reason contains `Notice reason`; upload picker is enabled before rights evidence exists. Real render and server actions, only HTTP/session boundaries substituted.
- `pnpm --filter @auto-tm/mobile exec vitest run src/services/HistoryEntry.recovery.spec.tsx test/screens/service-navigation.recovery.spec.tsx src/services/ServiceScreen.spec.tsx test/screens/cabinet-profile-identity.spec.tsx --maxWorkers=1`: 9 failed, 55 passed. Neutral discovery fails on unconditional 100 TMT; six Back controls missing; Account service history row missing. One inventory catalog HTTP handler was missing; added that boundary fixture and reran navigation alone: six genuine missing-Back failures, no setup failure.

Raw local logs: `/tmp/service-admin-red.log`, `/tmp/service-mobile-red.log`, `/tmp/service-navigation-red.log`. Red behavior is preserved in this checkpoint before production edits. These tests establish behavior only; browser/native presentation remains unproved.
