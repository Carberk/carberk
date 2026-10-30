# Final review fix round, 18 October 2026

The parent accepted all three unique findings from the independent Standards and Spec reviews on `729f01ed2b0666ef1aeb82f7c086ec97b2b2aec5`. The reports and dispositions were [posted together](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/904#issuecomment-6246789350). Both reviewers used OpenAI GPT-6.1-Sol through the T3 Code Codex harness at high reasoning effort, independently and read-only. Both requested changes. Hosted PR Checks `39105144839` and API image runtime `39105144840` passed on that reviewed SHA; those results do not waive its defects or verify the later fix.

This is the assigned bounded fix round. No dependency, contract, module ownership, staging, device, browser, SMTP or deployment change is included. Existing runtime acceptance and fixture cleanup engineering gates remain open.

## Findings and dispositions

| Accepted finding | Requirement | Bounded correction |
|---|---|---|
| P1: account changes resurrect a prior customer's composer through the retained route effect | Mobile data-fetching guidance requires identity changes not to expose the previous User's cache. The service workspace requires removed/no-access states not to leak private contents. | The customer stateful screen is keyed by the actual authenticated User ID. Identity changes unmount the entire composer and draft map together, so a later route effect cannot repopulate a cleared map from a previous render. |
| P2: New request selects a new conversation without restoring its own draft | #903 requires separate case/enquiry identities and service-messaging scope. General Support remains visually separate. | Creation, route entry and queue selection all use the same conversation transition. Back saves the current case draft and clears the visible composer. A new case starts empty, while the same account can reopen the original text/image/attachment draft. |
| P2: rejected operator pagination strands More, Send and handover busy | The approved service workspace requires accessible loading/error/retry. | Pagination catches real action rejection, exposes a retryable error and releases busy state in `finally`. Generation checks prevent stale responses from replacing another conversation. Refresh/open releases the outgoing pagination ownership. |

The same draft ownership rule also fences late create, send and upload completions after Back, another selection or identity unmount. These directly related lifecycle cases were reproduced through the real feature hooks, session store and MSW, then verified with the same tests. The fix does not mint sessions, alter query/auth boundaries or replay messages automatically.

## Genuine RED and same-test GREEN

RED `89e91747` was committed and pushed before production changes. The tests render actual feature components. Mobile uses real API hooks and `storeAuthSession`, with only native/storage/network boundaries mocked. Admin uses real actions, with rejection at the external Next request-context boundary rather than a repository-module mock.

| Command and boundary | Observed RED | Observed GREEN at `feed53d1` |
|---|---|---|
| `pnpm --filter @auto-tm/mobile exec vitest run src/services/ServiceScreen.spec.tsx` | Six failures, 24 passes. The account and New request cases expected an empty composer but received `Private old case draft`; late create/send cases changed or cleared another selected case, both within one account and after account change. | All 30 pass, preserving all 22 earlier positive cases. New assertions cover text plus uploaded image/attachment isolation, clean outbound payloads and recoverable original drafts within one account. Six delayed create/send/upload cases cover conversation and account changes. |
| `pnpm --filter @auto-tm/admin exec vitest run 'src/app/(admin)/services/ServiceWorkspace.pagination.spec.tsx'` | All three locale cases fail because no visible retryable error appears; three unhandled rejections originate in production `more()`. | All three locale cases pass with preserved reply text, released More control, retained first page and successful explicit retry. |
| Added pagination replacement lifecycle case, same production path | After the first rejection fix, queue refresh/reopen still left More disabled while an old page request was pending. The literal `disabled === false` assertion failed. | All four pagination cases pass after refresh/open explicitly relinquish old busy ownership; late rejection adds no current error. |
| Pagination plus existing service component and upstream HTTP suites | Existing positive coverage retained | Three files, 18 tests pass. |

Logs are preserved under `/tmp/carberk-campaign-delivery-20261014/`: `review-round2-mobile-red.log`, `review-round2-mobile-green.log`, `review-round2-admin-red.log`, `review-round2-admin-replacement-red.log` and `review-round2-admin-green.log`. The source GREEN checkpoint is `feed53d1`; the final evidence pin adds documentation only after source verification.

These are rendered component and external-boundary results. They do not establish actual browser-to-Next transport interruption, native media/PDF behavior, deployed authority or staging acceptance.

## Resulting source verification

All commands below passed at source `feed53d1`. They ran serially in the established integration install with `CI=1` and the documented unreachable generation-only Prisma URL on localhost port 1. No database was started or contacted. No dependency error or install repair occurred.

| Command | Actual result | Host-local log |
|---|---|---|
| `pnpm test:unit` | PASS, 10 workspace tasks; admin 330, mobile 3705, API 2346 with two skipped, worker 284 | `review-round2-unit.log` |
| `pnpm typecheck` | PASS, 11 workspace tasks | `review-round2-types.log` |
| `pnpm lint` | PASS, 11 workspace tasks | `review-round2-lint.log` |
| `pnpm test:root` | PASS, 295 passed, one skipped | `review-round2-root.log` |
| `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` | PASS | `review-round2-admin-ts6.log` |
| `pnpm --filter @auto-tm/mobile exec tsc6 --noEmit` | PASS | `review-round2-mobile-ts6.log` |
| `pnpm --filter @auto-tm/mobile exec expo install --check` | PASS, dependencies up to date | `review-round2-expo-dependencies.log` |
| `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear --output-dir /tmp/carberk-campaign-delivery-20261014/review-round2-ios-export` | PASS, 9.1 MB Hermes bundle and metadata | `review-round2-ios-export.log` |
| `git diff --check` | PASS | terminal receipt |

The current fetched `origin/main` is included. Source diff inspection confirms this fix round changes only the two service components, their rendered regression tests and evidence. No runtime package exports or backend code changed. All earlier positive draft/upload cases remain in the same passing mobile run. The later evidence checkpoint adds documentation only. Exact hosted checks on the resulting pushed candidate remain required and are recorded in PR904's Execution state without changing its source pin.

The parent inspected `feed53d1` and confirmed the bounded diff addresses the accepted findings without material scope, dependency, architecture or contract expansion. This is a finding disposition and fix verification, not a change to either reviewer's original Request changes verdict.

## Remaining gates

The final resulting candidate needs its own configured repository/hosted checks. The parent owns readback, review dispositions and protected finalization. No routine re-review is needed for this assigned nonmaterial fix round; a material addition would require new independent review. PR904 stays draft and auto-merge remains disabled.

The default-closed fixture profile still cannot dispose OTP delivery jobs/sink records or the broader campaign graph, scoped roster and media-worker state. Safe authenticated staging acceptance and latest-main restoration remain blocked until that cleanup contract and scoped authority exist. The [criterion index](criterion-evidence-index-20261018.md) retains browser/native, operational/provider/legal and human activation gaps separately. No completion, merge-readiness or service activation is claimed.
