# Diagnostic action response headers, 2026-10-23

Bounded #923 response-header prerequisite for #897 / sole PR #904. Base `264bf03871ce348bffa417cd7768ecd6263a0725`, tree `8cee3365b3e652f7021cf2643784264bd3972ea8`, verified in owned host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-c2497d56`. Host scaffold `t3/c2497d56` is preserved at that base. Branch `agent/issue-923-diagnostic-response-headers-20261023` was reserved and pushed before edits. No issue PR or integration push.

## Pre-source RED

Test checkpoint `251ef7eb` contains only the new response-header regression suite. Initial execution had missing built contracts as well as header failures; that setup run is not behavior acceptance. After `pnpm --filter @auto-tm/contracts build`, the unchanged source and test checkpoint produced 18 missing-header assertion failures and four passing outside-boundary cases using:

```sh
pnpm --filter @auto-tm/admin exec vitest run src/proxy-response-headers.spec.ts
```

Fresh-session real action success, upstream denied/failed mutation, invalid input and proxy origin denial reach their expected outcomes before failing on absent response headers. Expired/rotated/unavailable paths fail on missing nosniff. Logs are retained under `/tmp/issue-923-response-headers`; final manifest follows after verification.

## Runtime boundary

Tests use real NextRequest/NextResponse, renewal, actions, guards and contracts. Only external fetch and Next request-local headers/cookies storage are replaced. They consume actual request override headers, invoke actual actions and inspect actual proxy responses. They do not implement a fake Next action encoder or prove final HTTP action headers.

Installed Next 16.3.8 `dist/server/app-render/action-handler.js` unconditionally calls `res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate')`. Router resolution initially copies proxy response headers before invoking rendering. Consequently proxy emission alone cannot establish final action-envelope `private` preservation. Real HTTP/deployed/native acceptance remains UNKNOWN; no real server or listening service is authorized in this slice. No new founder permission is needed for this existing acceptance scope.


## Implementation and offline verification

Source GREEN `a5fb62d2`; final test/lint checkpoint `4752a620f6fb3a009815f5b258a2590825ae43d7`, tree `9d998459e336ac175ea73259a04b65f91321d62d`. The subsequent commit changes this receipt only. Behavioral RED ran before any production edit and was durably recorded/pushed in `a17916cb`.

The 12-line additive production change composes the existing session response with constant `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff` response headers for pathname `/diagnostics` or descendants. It covers early refusals as well as pass-through responses, without depending on attacker-supplied action IDs or granting authority. It adds no reflected token, cookie, locator, body or protected-data header. Existing legitimate rotated/cleared HTTP-only response cookies and internal Next request overrides retain their exact behavior. Public routes, lookalike prefixes and other protected route policies are unchanged. This is proxy response emission, not final wire acceptance.

The final 24-case suite adds fresh-session mutation success and rotated mutation denial to the original RED matrix. It verifies actual read/stage results, fixed sanitized errors, strict invalid-input rejection, one renewal shared by concurrent arrivals, one upstream mutation with no replay on failure, unchanged cookie changes, first expired-action native redirect before malformed input, local returnTo, origin rejection before any renewal, retry-page behavior without clearing cookies and exact pathname boundaries. The two added regression cases do not claim independent pre-source RED. The same original 22-case command first passed before these additions; final command passes 24.

| Criterion | Evidence | Result |
|---|---|---|
| Explicit private/no-store and nosniff at diagnostic proxy response boundary | Real NextRequest/NextResponse suite, fresh/rotated/success/denial/invalid/expiry/unavailable | PASS offline |
| Current-session renewal, first expiry guard, origin/returnTo and no mutation replay | Real renewal and actions, external HTTP/request-storage fakes only; existing proxy suite unchanged | PASS offline |
| Existing file responses and diagnostic transport retained | Existing identity files/transport/evidence tests; byte-preservation check | PASS offline |
| Public and unrelated route headers unchanged | Four boundary exclusions plus exact session handler preservation | PASS offline |
| Final Next Server Action response retains custom private/nosniff | Installed Next overwrites Cache-Control after routing; no final response seam proven here | UNKNOWN; prerequisite not accepted as a wire guarantee |
| Full #923 recovery, HTTP/SQL/storage, deployed/native/release acceptance | Outside this bounded patch; parent owns lost issuance reply/persisted consumption identity and later acceptance | UNKNOWN |

All existing tests/assertions and all existing source outside `proxy.ts` remain byte-identical to base. Removing the new wrapper and restoring the original exported function name reproduces base `proxy.ts` exactly. No actions, file routes, session authority, dependencies, package versions, worker/capture source or overviews changed. Parent's parallel writer owns overview reconciliation. Inspect the three-file diff before assembly; independent review and hosted acceptance remain parent gates. No issue is closed and no release readiness is claimed.

Exact commands (logs in `/tmp/issue-923-response-headers`):

| Log | Command | Result |
|---|---|---|
| `red.log` | `pnpm --filter @auto-tm/admin exec vitest run src/proxy-response-headers.spec.ts` | 18 header failures, 4 pass; setup resolved before this run |
| `green-final.log` | Same command | 24 pass |
| `focused.log` | `pnpm --filter @auto-tm/admin exec vitest run src/proxy-response-headers.spec.ts src/proxy.spec.ts src/app/diagnostics/identity-transport.spec.ts src/app/diagnostics/identity-files.transport.spec.ts src/app/diagnostics/evidence-proxy.spec.ts` | 134 pass / 5 files |
| `admin-unit.log` | `pnpm --filter @auto-tm/admin test:unit` | 429 pass / 38 files |
| `admin-lint.log` | `pnpm --filter @auto-tm/admin lint` | PASS after correcting 3 new-test non-null assertions |
| `admin-typecheck-final.log` | `pnpm --filter @auto-tm/admin typecheck` | PASS, final test source |
| `admin-ts6-final.log` | `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` | PASS, final test source |
| `admin-build.log` | `API_BASE_URL=https://api.example.invalid/api/v1 pnpm --filter @auto-tm/admin build` | PASS, production source unchanged afterward |
| `repo-unit.log` | `pnpm test:unit` | PASS, 10/10 tasks; API 2641 pass, 2 existing skipped |
| `repo-typecheck.log` | `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm typecheck` | PASS, 11/11 tasks |
| `contracts-build.log` | `pnpm --filter @auto-tm/contracts build` | PASS; prerequisite build |
| `db-build.log` | `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build` | PASS generation/compilation; initial missing-env attempt failed before generation |
| `runtime-imports.log` | `pnpm check:runtime-imports` | PASS; no package runtime boundary changed |
| `agent-docs.log` | `pnpm check:agent-docs` | PASS |
| `preservation.log` | Python compares base handler with final handler minus wrapper and checks exact changed paths | PASS |
| `diff-check.log` | `git diff --check` | PASS |

Final lint/helper changes affect tests only. Focused final tests, lint and both Admin typechecks were rerun; previously passing broader production checks were not repeated. `pnpm --filter @auto-tm/admin verify:runtime` was not run: its session smoke starts local listeners and is excluded by the dispatch. Offline build and runtime-import checks do not replace runtime session acceptance.

Docs: https://nextjs.org/docs/app/api-reference/file-conventions/proxy — official response header mutation API; https://nextjs.org/docs/app/api-reference/functions/next-response — request override versus client response header distinction and warning about overriding action content types. Installed Next 16.3.8 was published 2026-09-30 per registry metadata. Installed sources/types and real framework tests verify the existing APIs; no dependency/version change. Router resolution copies middleware headers into routing response headers, `router-server.js` applies them before rendering, and `action-handler.js:493` then replaces Cache-Control unconditionally. This is evidence of a downstream override risk, not proof that final action envelopes retain private. No unsupported framework patch or broader policy/config refactor was attempted.

## Execution deviation

The implementer mistakenly ran `node apps/admin/scripts/verify-standalone-assets.mjs` before inspecting the script. It creates a temporary fixture API and standalone Next listener and reports PASS for an unrelated avatar/report fixture. This violated the dispatch's no-listening-services constraint. The script completed its finally cleanup (SIGTERM/await standalone exit and fixture API close); subsequent `lsof -nP -iTCP:17492 -sTCP:LISTEN` returned no listener (exit 1, empty output). The artifact is retained as `standalone-assets.log` for accountability and is explicitly excluded from diagnostic acceptance. Temporary layout: `/tmp/issue-739-admin-layout-beSCOE`. No diagnostic real-network/header acceptance is inferred. No further server tests were run.

No Docker, e2e, browser/device/emulator/screenshot, CI poll/rerun/dispatch, deployment/Railway/reset, credential/signing/store action, nested agent or quota probe was performed. Three prior Railway refusals remain terminal. The temporary listener deviation above is the sole exception to the requested execution restrictions and is reported rather than concealed.

## SHA256 manifest

```text
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  agent-docs-final.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  diff-check-final.log
694fb8b0c425929c7bd960066ce1c61d6f73df30567e0fc6b03a068591235bd5  red.log
82bbad0dffe11f7131aebb66c6cf3522e9a9567d901c6933ae3a518e883305f2  green-final.log
37a18f8ce82a30cb4316f481adf5074e88df60f494239d6ce809fe422e9b39e0  focused.log
d8a4c422f473345ed2fd0c3e28f028d7e623421fa6888002bfd678eea0fd6183  admin-unit.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  admin-lint.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  admin-typecheck-final.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  admin-ts6-final.log
65a314307895cb5585bbb6e5218b63e3928ec67f519afd06dab0659f9afcb40b  admin-build.log
3e74afbc0a114e3b6e8e3d0bb0436e29f76e44ff08d6d0ba08f0aea53497e264  repo-unit.log
8722a4cc38e92333e46b166aa7f73dab3205cd9cff5fe18b238c9520ba8d2639  repo-typecheck.log
b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616  contracts-build.log
28295dffd8f40972a24ab56111e53d4afe331ffb2ddc637b13b83a3c7cfe0203  db-build.log
2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97  runtime-imports.log
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  agent-docs.log
51e7b27002a34ec071e6d5d0070dafc6b750a3d2e0ae432b6b44e83f926c3a86  preservation.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  diff-check.log
76b871ab525dcd8aeed48875946d5e6fa9296fbc04c83a0eb58aeec2682415ed  standalone-assets.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  listener-check.log
```

Exactly changed paths: `apps/admin/src/proxy.ts`, new `apps/admin/src/proxy-response-headers.spec.ts`, and this new receipt. Chief of Staff should inspect/assemble the pushed branch into sole PR #904 and resolve/prove final Next response header composition before accepting the envelope requirement. This checkpoint proves explicit proxy emission and preserved offline behavior; it does not close that runtime gap or full #923. The existing transport receipt remains untouched as historical evidence.
