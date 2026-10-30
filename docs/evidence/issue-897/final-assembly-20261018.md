# Final assembly verification checkpoint, 18 October 2026

Subsequent independent reviews requested three bounded service corrections. [The final review fix record](review-round2-service-isolation-20261018.md) records RED `89e91747`, source GREEN `feed53d1` and the resulting candidate verification. This earlier assembly record remains a historical receipt; it does not certify source changes after `729f01ed`.

The assembly writer incorporated the two accepted History UI fixes after the SMTP and bounded fixture additions. Runtime source checkpoint `6140d0f52d6403270d4dd32beef9212c16f34c65` is the subject of the local checks below. The final review pin adds documentation only after that checkpoint. Exact hosted checks must run on the pushed review pin, and their final results belong in PR904's Execution state before review finalization. This is an incomplete campaign candidate, not a merge or activation approval.

## Ordered changes and earlier hosted evidence

- Reviewed baseline `ef85f17f308a36cf7a7c8e8c45717d45b534f864` passed hosted run `39102150141`. [Review fixes](review-fixes-20261018.md) records the accepted video, service draft, staff rejection and diagnostic copy fixes and their real RED/GREEN boundaries.
- SMTP configuration/adapter checkpoints end at `4157afb643e30e064140e81168851891101925a0`. The parent verified one authenticated synthetic submission at `2026-10-18T06:22:07.868Z` and persisted suppression of the same incident in a fresh process. The inbox receipt and acknowledgement remain unknown. OTP remains on Resend.
- Fixture RED source checkpoints `eac6417f`, `4477b46e`, `8a9afb0e`, `30015280` were incorporated as `97b8936f`, `4ff8d720`, `07fd709c`, `83d8acf3`. Hosted run `39104191526`, database job `117606486050`, reached real disposable PostgreSQL and failed exactly the four intended campaign fixture success assertions. There were 280 passing tests and four failing tests, with no import/setup failure.
- Fixture implementation `c7ad4f9b` was incorporated as `59ed534600c1ef3cc308e6a80bfbcbab4a1500ce`. Hosted [PR Checks 39104576573](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/39104576573) and [API image runtime 39104576577](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/39104576577) both succeeded. Database job `117607674517` passed the same four campaign cases, all seven fixture cases and all 284 database tests across 31 files. Full SQL logs are `fixtures-red-db-39104191526.log` and `fixtures-green-db-39104576573.log` in the host-local evidence directory below. Those runs precede the History UI changes.
- History source RED `addc7574`, GREEN `26a9ff08` and evidence `8ff53a7e` were incorporated in order as `7e466580`, `0f923e11`, `6140d0f5`. The isolated writer observed seven failing admin cases and three failing mobile cases before implementation; focused GREEN was nine admin and 22 mobile cases. [History evidence](../campaign-897/history-ui-fixes-20261018.md) retains the exact commands and original logs. The fix catches rejected child actions, releases busy state for the current assignment, ignores stale completion, preserves drafts for explicit retry and displays the protected API's existing provider/VIN PDF filename and localized byte size.

The admin rejection tests render real components and actions with the external Next request-context boundary rejecting. They do not exercise a real browser-to-Next interruption. That required runtime evidence remains missing.

## Assembled local checks

All logs below live under `/tmp/carberk-campaign-delivery-20261014/`. The checks ran serially in the established integration install. Prisma configuration requires `DATABASE_URL` even for generation. The first unit attempt stopped at that configuration requirement, not an assertion. The subsequent checks used the explicit generation-only URL `postgresql://generation:generation@127.0.0.1:1/generation` and `CI=1`. No database service was started or contacted.

| Command | Actual result | Log |
|---|---|---|
| `pnpm test:root` | PASS, 295 passed, one skipped | `final-root.log` |
| `pnpm test:unit`, first attempt | Configuration failure, missing `DATABASE_URL` during Prisma generation | `final-unit.log` |
| `pnpm test:unit`, configured generation retry | PASS, 10 workspace tasks; admin 326, mobile 3697, API 2346 with two skipped, worker 284 | `final-unit-retry.log` |
| `pnpm typecheck` | PASS, 11 workspace tasks | `final-types.log` |
| `pnpm lint` | PASS, 11 workspace tasks | `final-lint.log` |
| `pnpm check:runtime-imports` | PASS, database and contracts CommonJS/ESM loads | `final-runtime.log` |
| `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` | PASS | `final-admin-ts6.log` |
| `pnpm --filter @auto-tm/mobile exec tsc6 --noEmit` | PASS | `final-mobile-ts6.log` |
| `pnpm --filter @auto-tm/mobile exec expo install --check` | PASS, dependencies up to date | `final-expo-dependencies.log` |
| `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear --output-dir /tmp/carberk-campaign-delivery-20261014/final-ios-export` | PASS, iOS Hermes bundle and metadata exported | `final-ios-export.log` |
| `git diff --check` | PASS | terminal receipt |

The isolated writer's missing-Prisma and `semver/functions/satisfies` failures did not reproduce in this integration install. No dependency, lockfile, Metro or generated-source patch was used to obtain these results. The iOS export is a bundle check; it does not establish native runtime or visual acceptance. Worker build, TypeScript 6 and built SMTP runtime load already passed at unchanged worker source `4157afb6`, as recorded in the review evidence.

The combined diff since the reviewed baseline was inspected, including the staging control/profile binding, fixed remote SQL adapter, SMTP route and receipt handling, History child action recovery and customer metadata. Current `origin/main` is included. Unrelated untracked `docs/evidence/issue-920/railway-runtime-20261018.json` remains preserved and is not staged as evidence.

## Acceptance status and ownership

| Criterion | Evidence | Result |
|---|---|---|
| Accepted source review fixes and assembled repository checks | RED/GREEN records above and local checks | PASS within the exercised boundaries |
| Bounded fixture storage and default-closed control | Actual hosted PostgreSQL RED/GREEN; local 38 control cases | PASS for four identity prerequisites and guarded pre-OTP disposal only |
| Authenticated monitoring SMTP submission and restart deduplication | Parent receipt at source `4157afb6` | PASS; inbox receipt, recovery alert and deployed topology remain unverified |
| History rejection recovery and PDF filename/size | Real components/actions at external framework boundary; customer component/MSW interactions | PASS within those boundaries; real browser/native proof missing |
| Final exact review pin hosted checks | PR904 Execution state must identify the exact resulting candidate and completed runs | Required after this checkpoint is pushed |
| Independent Standards and Spec review after SMTP/fixture/History additions | Parent dispatches fresh read-only reviewers on the final pin | Required |
| Safe authenticated full campaign fixture lifecycle | OTP delivery queue/sink disposal and broader graph/roster/media-worker cleanup remain unsupported | Blocked engineering requirement; staging activation stays closed |
| Browser, native and reserved deployed acceptance/restoration | [Criterion index](criterion-evidence-index-20261018.md), [source UI purpose audit](ui-purpose-source-audit-20261018.md) and host preparation records | Blocked, with named tooling, environment and activation inputs |

The [criterion index](criterion-evidence-index-20261018.md) maps all selected implementation children and #886 slices without treating historical source or test presence as current acceptance. No newly unassigned source requirement was found by that mapping pass. It preserves the known cleanup engineering gaps separately from the Railway token refusal, bounded browser timeouts, device availability, provider facts and human activation requirements.

The profile flag remains unset. No staging mutation, browser/device action, mail submission or merge was performed by the assembly writer. The parent owns final PR/issue Execution state, exact hosted-result readback, independent reviews, criterion decisions and any separately authorized operational acceptance. PR904 remains draft with auto-merge disabled. Stop source mutation at the final review pin unless the parent authorizes the resulting review fix round.
