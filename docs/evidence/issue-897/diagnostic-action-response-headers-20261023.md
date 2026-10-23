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
