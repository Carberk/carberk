# #445 session boundary source handoff — 2026-10-20

Implementation checkpoint for parent #897 and sole integration PR #904. This is a source handoff, not integration acceptance.

- Supplied base: `0eefa49d37106c7742c482bb62b2c1855bfad203` (clean checkout).
- Owned branch: `agent/issue-445-source-20261020`, reserved and pushed at the supplied base before edits.
- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-3de11222`.
- Host scaffold: `t3/issue-445-identity-session-source`, preserved at the supplied base.
- Authority: live [issue #445](https://github.com/Carberk/carberk/issues/445), [accepted execution comment 6258534331](https://github.com/Carberk/carberk/issues/445#issuecomment-6258534331), and root's supplied replacement contract for the unavailable `/tmp/carberk-campaign-delivery-20261014` pointers.
- Original test-only refs remain untouched: local/remote `agent/issue-445` at `0ec5b53c2cbf5a1ecc6f0f34d69fbb4b48ac828e`, retaining `a71a5fb3`. Their assembled equivalents `5967c0ef` and `c01fbdbb` are ancestors of this base.

## Before evidence

Root supplied executed test-first evidence on this exact base; the writer inspected the saved logs before source edits.

| Criterion | Executed base evidence | Result |
|---|---|---|
| Session, repository and repository token must be private | Static job `118641828751`, run `39426922332`: `/tmp/carberk-next-release-20261020/0eefa49d-static-118641828751.plain.log`, lines 609–611 | RED: exactly three TS2578 unused `@ts-expect-error` directives at `identity-public-boundary.ts:5,8,11`; exports still leak |
| Preserve real admin HTTP behavior | API job `118641828783`, same run: `/tmp/carberk-next-release-20261020/0eefa49d-api-118641828783.plain.log`, line 1759 onward | Baseline 39/39 AdminCatalogController tests pass, including 11 Identity-composed elevation cases |

The complete base API job was 311/312 files and 2987/2988 tests; the sole failure was unrelated full-v3 TOTP enrollment at `CampaignFullV3.e2e.spec.ts:150` (expected 201, got 500). This writer did not change that writer's files.

`apps/api/test/typecheck/identity-public-boundary.ts` and `apps/api/src/modules/catalog/presentation/AdminCatalogController.e2e.spec.ts` are byte-for-byte unchanged from the supplied base. No HTTP test was replaced by local mocks.

## Implementation and preserved contract

`AdminSessionElevationPort` exposes only `check({ userId, sessionId })` and a four-value result: `elevated`, `session-required`, `session-expired`, or `elevation-expired`. No Session, refresh hash, write method or deadline record crosses this seam. `CheckAdminSessionElevation` reads the existing SessionRepository and ClockPort internally. IdentityModule binds and exports the elevation token; its SessionRepository binding stays internal.

Only the public `Session`, `SessionRepository`, and `IDENTITY_SESSION_REPOSITORY` exports and Nest repository export were removed. Public `ClockPort` / `IDENTITY_CLOCK_PORT` and the Nest clock export remain for Listings. Caller inspection found only AdminGuard and its old spec consuming the removed public exports; Listings' clock consumers are unchanged.

AdminGuard stays in `common` with this exact refusal order:

1. Missing subject: existing 401 `Authentication required` exception envelope.
2. Current `IdentityCheckPort.isAdmin` refusal: 403 `{ code: "FORBIDDEN", message: "Admin role required" }`; JWT role is not authority.
3. Missing sid, missing session, or foreign owner: 403 `{ code: "FORBIDDEN", message: "Admin TOTP elevation required" }`.
4. Owned session deadline `<= now`: 403 `{ code: "FORBIDDEN", message: "Admin session expired" }`, before any elevation-deadline refusal.
5. Null or `<= now` elevation deadline: 403 `{ code: "FORBIDDEN", message: "Admin TOTP elevation expired" }`.
6. Otherwise allow. Storage failures propagate as before.

Identity samples the clock exactly once after awaiting lookup and after missing-session/owner refusal; both deadlines use that same sample. No clock read occurs for missing or foreign sessions. Auth policy, JWT semantics, Session lifetime, refresh rotation, suspension and role behavior are unchanged.

The 11 original named guard behaviors migrated into `CheckAdminSessionElevation.spec.ts`, where the real guard composes the real Identity checker over database/time fakes. Twelve additional cases prove exact refusal envelopes, owner/deadline precedence and equality, role/sid-before-storage behavior, time after asynchronous lookup, one shared time sample, and storage-failure propagation. Shared fakes live under Identity's `application/testing`; its existing IdentityCheck fake gained admin state with its previous defaults preserved.

## Local verification

All commands below finished with exit 0. Logs are local artifacts; hosted GREEN must be collected by root on the assembled candidate.

| Command / inspection | Result | Log under `/tmp/` |
|---|---|---|
| `pnpm install --frozen-lockfile` | Dependency setup only; no manifest/lockfile edits | `issue-445-source-install.log` |
| `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @auto-tm/db build` | Prisma generation and DB build pass; no database connection | `issue-445-source-db-build.log` |
| `pnpm --filter @auto-tm/contracts build` | Pass | `issue-445-source-contracts-build.log` |
| `pnpm --filter @auto-tm/api typecheck` | GREEN, configured TypeScript 7; unchanged negative consumer fixture now passes | `issue-445-source-typecheck.log` |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | Pass | `issue-445-source-tsc6.log` |
| Focused Vitest command below | 23/23 tests | `issue-445-source-units.log` |
| Regression Vitest command below | 140/140 tests, six files | `issue-445-source-regressions.log` |
| `pnpm --filter @auto-tm/api lint` | Pass, whole API workspace, zero warnings | `issue-445-source-lint.log` |
| `pnpm --filter @auto-tm/api build` | Pass, Nest compilation | `issue-445-source-api-build.log` |
| `pnpm check:runtime-imports` | DB and contracts import successfully | `issue-445-source-runtime-imports.log` |
| `pnpm check:agent-docs` | Local links, headings, map and policy routes pass | `issue-445-source-agent-docs.log` |
| `pnpm check:glossary` | Pass, 29 terms | `issue-445-source-glossary.log` |
| Diff, retained test names and boundary scan | Acceptance tests unchanged; all 11 original names retained; no production SessionRepository/refreshTokenHash/repository-token references outside Identity | `issue-445-source-boundary-scan.log` |

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/application/CheckAdminSessionElevation.spec.ts
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/application/CheckAdminSessionElevation.spec.ts src/modules/identity/application/RefreshSession.spec.ts src/modules/identity/application/GetAdminTotpStatus.spec.ts src/modules/identity/application/VerifyAdminTotp.spec.ts src/modules/identity/application/VerifyOtp.spec.ts src/modules/identity/application/ConfirmAccountDeletion.spec.ts src/modules/identity/application/VerifySignInCode.spec.ts
```

The regression invocation selected six existing files (there is no `VerifySignInCode.spec.ts`); Vitest reports six files and 140 tests. An initial DB build without DATABASE_URL stopped during configuration, so an initial API typecheck lacked DB declarations. Supplying the generation-only placeholder fixed setup; the recorded final builds and both API typechecks pass.

The scan excludes specs: existing cross-context e2e fixtures still seed sessions through Prisma directly; these are not public Session exports. This change concerns the Identity public entry point. No workspace package exports/runtime format changed, so worker/mobile checks were not added to this bounded source handoff.

Docs: no external dependency or API lookup needed; this uses existing repository/Nest injection patterns and installed tool configuration. Read run-issue and installed TDD guidance; `.claude/skills/tdd/SKILL.md` is absent. The accepted compile/HTTP seams and retained guard behaviors supply the agreed test surface.

## Changed files and remaining gates

- `apps/api/src/common/admin.guard.ts`; old `admin.guard.spec.ts` moved into Identity's composed behavior suite.
- `apps/api/src/modules/identity/domain/ports/AdminSessionElevationPort.ts`.
- `apps/api/src/modules/identity/application/CheckAdminSessionElevation.ts` and `.spec.ts`.
- Identity test fakes: `application/testing/InMemorySessions.ts`, `MutableClock.ts`, and `InMemoryIdentityCheck.ts`.
- Identity `identity.module.ts`, `identity.public.ts`, and owning `CONTEXT.md`.
- This evidence file.

| Remaining integration gate | Owner / status |
|---|---|
| Same unchanged real AdminCatalogController HTTP suite GREEN after source assembly | Root; not run locally, no disposable services used by this writer |
| Independent Standards and Spec review on pinned integration SHA | Root; not requested by this writer |
| Applicable hosted CI, full candidate verification and deployed acceptance | Root under #897 / #904; not dispatched, polled or watched here |

No issue PR, reviewer, nested agent, Docker, local service suite, staging/provider/device/credential action, dependency/schema change, merge or closure was performed. Root retains assembly and #897/#901/#904 record ownership. Stop at pushed source handoff.
