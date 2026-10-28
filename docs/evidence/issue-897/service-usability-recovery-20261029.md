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

## Implemented and focused green

The initial red is pinned at `ce6d2189`. After production edits the same recovery criteria passed. The first green attempt additionally exposed a legacy unconditional-price expectation and an unconditional price in the repeat warning. The latter was observed red before removing only the price clause in TK/RU/EN; the existing free-reopen/no-updated-history warning remains.

`pnpm --filter @auto-tm/mobile exec vitest run src/services/HistoryEntry.recovery.spec.tsx test/screens/service-navigation.recovery.spec.tsx src/services/ServiceScreen.spec.tsx test/screens/cabinet-profile-identity.spec.tsx src/notifications/useDirectMessagePushRouting.spec.tsx src/listings/feed/HomeHeader.spec.tsx test/screens/chat-tab.spec.tsx src/business/BusinessScreen.spec.tsx src/business/InventoryScreen.spec.tsx src/business/EnquiriesScreen.spec.tsx src/diagnostics/DiagnosticSurfaces.spec.tsx src/diagnostics/DiagnosticReader.spec.tsx --maxWorkers=1`: **12 files, 178 tests passed**. This includes actual hooks/MSW for private history, denied create with retained existing history, contextual/repeat entry, admitted synthetic commands, Account sign-out audience, business/inventory/enquiries and diagnostic reader regressions. The focused push test establishes route wiring, not actual push delivery.

`pnpm --filter @auto-tm/admin exec vitest run 'src/app/(admin)/services/ServiceWorkspace.recovery.spec.tsx' 'src/app/(admin)/services/ServiceWorkspace.spec.tsx' 'src/app/(admin)/services/ServiceWorkspace.transport.spec.tsx' 'src/app/(admin)/services/ServiceWorkspace.pagination.spec.tsx' --maxWorkers=1`: **4 files, 22 tests passed**. Real workspace/actions with boundary HTTP interception prove independent notice/closure reason+body, preserved notice after closure, exact retry identity, explicit real/synthetic rights, actual staff-entered History expiry/reason, and separate upload retry.

Admin TS7, TS6 and affected-file ESLint passed. Mobile TS7 reported only the tracked stale `.expo/types/router.d.ts` route union after the route move. Mobile lint reported import blank lines and an empty native File test fake; source fixes prepared. No cast or widened navigation type was used to hide the route mismatch. Regenerate the tracked Expo route declarations before rerunning both compilers.

The next worker interval owns timing CPU. No new checks started after the coordinator's hold; source/evidence editing continues only. Latest local logs: `/tmp/service-mobile-green2.log`, `/tmp/service-admin-green1.log`, `/tmp/service-admin-ts7.log`, `/tmp/service-admin-ts6.log`, `/tmp/service-admin-lint.log`, `/tmp/service-mobile-ts7.log`, `/tmp/service-mobile-lint.log`.

## Acceptance map and handoff boundaries

| Criterion | Governing source | Evidence / remaining gate |
| --- | --- | --- |
| Unambiguous Account versus customer service routing | Cabinet wireframe/hifi, service-workspace customer surfaces | Account stays `/(tabs)/services`; `/service-requests` owns customer workspace. History/Home, Support including sign-in return, customer-workspace sign-in return and service push updated. Render/MSW and focused route tests green; tracked Expo declarations need regeneration and compiler rerun. |
| Notice versus close-awaiting draft isolation | Service-workspace operator forms, ADR-0106 Support lifecycle | Separate reason and body, own closure form/idempotency identity, draft retained on failure and opposite draft preserved on success. Admin render through real actions green. |
| Truthful upload provenance | ADR-0106 classified rights, existing `ServiceRightsSchema` / `assertServiceRights` | No synthesized ownership claim. Staff chooses real/synthetic and records basis/source evidence. Support schedule remains 90 days after closure/account deletion; History requires explicit future UTC expiry and reason. Conservative personal classification and service-only use. Admin HTTP payload/readiness/retry tests green; actual API authorization/byte delivery remains coordinator proof. |
| Six screens have approved navigation controls | Existing `StackHeader`, `BackButton`, `SafeScreen`, `useSafeBack`; ADR-0104 audience separation | Service workspace, business workspace, inventory, enquiries, private inspection history and inspection report route. Actual feature render/back/fallback green; final additional public-report fallback assertion pending rerun. No global shared UI component changed. |
| Account audience and retained history | ADR-0103 invitation/member access, ADR-0104 private audience/history, ADR-0106 service history | Entries remain authenticated. Business entry keeps recipient-bound invitation redemption reachable without membership. No appointment/purchase service is introduced. Existing authenticated history remains independent of new-command denial. Final strengthened History-purpose denial regression pending rerun. |
| Neutral History discovery, no inferred activation | Accepted coordinator steering, ADR-0106 activation gates | Entry and pre-offer workspace omit unconditional price; repeat warning preserves free reopening without a new payable claim. Existing admitted tester command workflow remains server validated. No availability/config/schema contract added. Public availability/audience projection is still absent, so richer activation rules require a separate contract/evidence gate. |
| Visual/runtime acceptance | UI-MODE and service-workspace verification boundary | Coordinator must prove deployed customer/operator HTTP states, TK/RU/EN narrow/tablet/keyboard recovery, native headers/back/safe areas and actual private artifact/push behavior on the assembled candidate. This writer owns no browser/device/Metro/DB session. |

The code retains the existing synthetic mobile upload path and existing synthetic History fulfilment contracts. This repair does not authorize commercial activation or real provider/payment execution. The new admin communication-image form records staff assertions under the existing schema; server admission, capability, assignment and rights enforcement remain authoritative.

Preserve this worktree and branch for assembly. Cleanup tuple: writer-owned `/Users/bagtyyar/.t3/worktrees/carberk/t3-aed62215`, branch `agent/issue-897-service-usability-20261029`, base `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab`. No owned long-running sessions need stopping. Retain the previous stopped worktree and its refs; no git command or write was run there. Admin workspace and Account source in that old tree were also compared read-only to the base and contain no salvage delta.

## Final focused window

Coordinator explicitly extended scope to the same minimal navigation repair in `ShowroomScreen` and assigned this writer the next focused CPU window. Installed Expo SDK generator regenerated tracked route declarations without a Metro/server session. The generated diff changes only the three route unions for `/service-requests`, preserving Cabinet's `/services` route.

Showroom render RED: `pnpm --filter @auto-tm/mobile exec vitest run src/business/ShowroomScreen.spec.tsx -t 'keeps direct-entry' --maxWorkers=1` fails specifically with missing button `Back` after real HTTP 404 handling. An earlier all-file attempt hit an existing unawaited asynchronous unmount in its preceding recovery test; the isolated run establishes the genuine missing-control red. Preserve logs `/tmp/service-showroom-red.log`, `/tmp/service-showroom-red2.log`. The preceding test's unmount will be awaited before the final full-file rerun.

Per coordinator, iOS export remains an assembly gate. No new test/build/compiler window will start after this finite window is released without coordination.
