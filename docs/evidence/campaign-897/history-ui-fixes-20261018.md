# History UI fix handoff, 2026-10-18

Implementation writer for campaign #897 and existing PR #904. Branch `t3/campaign-897-history-ui-fixes`, owned worktree `/Users/bagtyyar/.t3/worktrees/auto.tm-rewrite/t3-5efe276d`. Integration branch and its checkout were not changed. No PR was created. No staging, browser or device session was opened.

Base: `83d8acf38d1837be0c4f860193903af365569d55`.
Pushed RED checkpoint: `addc75741606c5e9a256cb44f59d13c1ed769613`.
Pushed implementation/GREEN checkpoint: `26a9ff08ea72745114d37cb428f637a55c694ae3`.

Only the two accepted P2s in `/tmp/carberk-campaign-delivery-20261014/ui-purpose-source-audit-20261018.md` are addressed. The governing approved design is `docs/prd/ui/service-workspace.md`, customer artifact criterion at line 15 and async recovery/accessibility criteria. `docs/design-approved/service-workspace.md` does not exist. This is current-state conformance maintenance with adequate approved requirements, not a redesign. Overview ownership and limitations are unchanged.

## Behavior and evidence

| Criterion | RED before implementation | GREEN |
| --- | --- | --- |
| Actual admin child RPC rejection recovers with an alert, draft retained and enabled explicit retry | Seven failures and seven unhandled rejections. `Unable to find role="alert"`; rejected `private RPC failure` left busy controls disabled. | Nine rendered tests pass, including historical-payment reads in TK/RU/EN, order command, artifact command, initial reads and two late-assignment rejection cases. |
| Delivered customer artifact exposes filename and size before opening | Three locale cases failed at `findByText("carfax-1HGCM82633A004352.pdf")`; 19 existing service tests passed. | Same service-screen suite: 22 pass. Each locale case also asserts `4 B` before pressing Open PDF. |

Admin tests render `HistoryWorkspace` and `HistoryReportsWorkspace` with real children and real repository Server Actions. The external Next.js `headers()` boundary rejects before the action result wrapper. This supplies a genuinely rejected action promise to the rendered child, unlike an upstream fetch error converted into `{ ok: false }`. No repository hook, action or child is mocked. HTTP uses the existing fetch boundary. This is component evidence of rejection recovery, not a real browser Flight/RPC wire or redirect walkthrough.

The fix catches rejected reads and commands, shows existing localized errors, and releases busy state in same-assignment `finally` blocks. Separate read sequence and assignment epoch guards retain latest-read ordering while allowing command cleanup after refresh. Assignment changes release old busy state; an old rejection cannot clear a newer command's busy state or set its alert. No mutation is automatically replayed. Existing draft fields and retry identities remain intact.

Mobile filename matches the existing protected-download name owned by `PrismaServiceMessaging.historyReportFile`: `${artifact.provider}-${artifact.vin}.pdf`. This is the download filename, not a claim to retain an uploaded original name. No contract or API change is needed because both values already exist in the report projection. Filename is selectable native Text with natural wrapping and no truncation; size is readable native Text with locale number formatting and B/KiB/MiB scaling. Layout and screen-reader speech still need native acceptance.

## Commands and logs

All logs below are in `/tmp/carberk-campaign-delivery-20261014/history-ui-fixes/`.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm --filter @auto-tm/admin exec vitest run 'src/app/(admin)/services/HistoryWorkspace.rejection.spec.tsx'` at RED checkpoint | FAIL, 7 failures / 7 unhandled rejections, expected criterion failure | `admin-red.log` |
| Same command after implementation, plus late-assignment cases | PASS, 9 tests | `admin-green.log` |
| `pnpm --filter @auto-tm/mobile exec vitest run src/services/ServiceScreen.spec.tsx` before implementation | FAIL, 3 failures / 19 pass, missing required filename | `mobile-red.log` |
| Same mobile command after implementation | PASS, 22 tests | `mobile-green.log` |
| `pnpm --filter @auto-tm/admin test` | PASS, 34 files / 326 tests | `admin-suite.log` |
| `pnpm --filter @auto-tm/mobile test` | PASS, 347 files / 3697 tests | `mobile-suite.log` |
| `pnpm --filter @auto-tm/admin typecheck` | PASS | `admin-typecheck.log` |
| `pnpm --filter @auto-tm/mobile typecheck` | PASS | `mobile-typecheck.log` |
| `pnpm --filter @auto-tm/admin lint` | PASS | `admin-lint.log` |
| `pnpm --filter @auto-tm/mobile lint` | PASS | `mobile-lint.log` |
| `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check` | PASS, dependencies up to date | `expo-dependencies.log` |
| `pnpm test:unit` | BLOCKED at DB build: `Command "prisma" not found` | `repository-unit.log` |
| `pnpm typecheck` | BLOCKED at DB build: `Command "prisma" not found` | `repository-typecheck.log` |
| `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear --output-dir /tmp/carberk-campaign-delivery-20261014/history-ui-fixes/ios-export` | BLOCKED: Reanimated cannot resolve `semver/functions/satisfies` | `expo-ios-export.log` |
| `git diff --check` | PASS | inspected at implementation checkpoint |

Contracts were built locally through their configured build command to prepare existing imports. No generated contract files, dependency files, DB, SMTP, fixture or global-navigation files changed. The supplied unrelated fixture RED was preserved; these repository gate attempts stopped earlier on missing Prisma, so they do not re-establish or resolve that fixture result.

Docs: not applicable. Internal UI rejection handling and rendering existing report data; no dependency, service, framework API or version changes.

## Remaining gates and ownership

This is an implementation handoff, not final campaign acceptance. Chief of Staff owns assembly into PR #904, independent Standards/Spec review, repository/hosted checks with complete dependencies, and the already-consolidated native/browser acceptance. Required browser/native screenshots, narrow/tablet layout, light/dark, text scale, keyboard/screen-reader, native PDF open/download/share and deployed acceptance remain unproved. User explicitly prohibited browser/device sessions because host unavailability was already audited. No native visual or runtime acceptance is claimed.

Next action: integration owner incorporates the ordered checkpoints, repairs the environment for blocked gates outside this bounded fix, and retains the existing unrelated fixture RED and operational acceptance gates.

## Integration verification superseding isolated environment failures

The assembly writer incorporated this chain through `6140d0f52d6403270d4dd32beef9212c16f34c65`. In the established integration install, root, unit, workspace TypeScript, lint, runtime import and admin/mobile TypeScript 6 checks passed. Expo dependency alignment and a clean iOS export also passed. The isolated missing-Prisma and `semver/functions/satisfies` failures did not reproduce. A generation-only `DATABASE_URL` was needed for Prisma configuration; no database connection or dependency patch was used. [Final assembly evidence](../issue-897/final-assembly-20261018.md) records exact commands, counts and logs. Browser RPC, native and deployed acceptance remain missing.
