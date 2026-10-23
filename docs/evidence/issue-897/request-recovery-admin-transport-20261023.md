# Protected Admin request recovery transport, 2026-10-23

Bounded implementation for #923 within #897 and sole draft [PR #904](https://github.com/Carberk/carberk/pull/904). Offline server-action transport only; this receipt does not establish UI recovery, real SQL/worker acceptance, final action-envelope headers or release readiness. Chief of Staff owns assembly, the parent execution record, review and publication. No issue PR or integration push was made.

## Ownership and ancestry

Owned worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-e7509602`; owned branch `agent/issue-923-request-recovery-admin-20261023`, reserved and pushed at supplied base before editing. Scaffold `t3/e7509602` remains at the supplied base. Codex medium/Standard; no nested agents or quota probes.

| Checkpoint | Commit | Tree |
|---|---|---|
| Supplied base | `af79cad807799d0acc7843759c1b9a05d456c424` | `57493059b4467e714c71f509a8d975c24b4528a6` |
| First pushed missing-action RED | `d138b7a376f73a045966eb8b50ddcf5a86d4b486` | `a2f9e4e7d13c23b749b68178387d71bdc08ab169` |
| Corrected test-only RED, pushed before source commit | `0a87535f2011c660ec82b2adccfef6325b29537b` | `3361ef4bf5f62d0e70825e3355402143520d47d2` |
| Incorporated parent docs followup | `7bfe53968066cc28a80223f1f5fcc71f0808330b` | `1275d137c4f53fe627cab63ef4cb08dd54f1d75d` |
| Clean parent merge | `abbb0cfae55147c1e9b9ede255beaa0c3500895e` | `1d49f08ad86c6a5a64e35c5b8aca2bd522f38000` |
| Pushed source GREEN | `007128fb051b047c441150889d144bb5861c36ef` | `53efd80ec03e5a8ecfcd3e79a3929c9aeacb2731` |

Final receipt-only head/tree and final artifact manifest are returned separately to avoid self-reference. The parent followup changes only three documentation paths relative to the supplied base; product source/tests/schema remain identical. Current main `9fde309c` is included through the parent. No product verification was repeated solely for those docs changes.

## Boundary and behavior

Four additive exports in `apps/admin/src/app/diagnostics/actions.ts` call the existing `protectedDiagnostic`, `diagnosticFetch` and `diagnosticJson` bridge. Existing actions, helpers, proxy and diagnostic header wrapper remain unchanged. Current API contracts and endpoints were inspected directly; no route, authority, TTL, directory, rights basis, hold or policy was added. The existing transport supplies current cookie bearer authority, expired-Session rejection before validation, mutation Origin checks, fixed public errors, bounded JSON, no-store and manual redirect refusal.

- `diagnosticPrepareContinuityRequest(B, input)` POSTs strict `{kind}` to `/diagnostics/orders/:B/continuity-requests`. The response must be a strict pending identity of the requested kind.
- `diagnosticContinuityRequests(B, page)` GETs that collection with only the existing bounded, encoded cursor query. It accepts only the strict bounded request page.
- `diagnosticRecoverContinuityRequest(B, requestId)` GETs `/diagnostics/orders/:B/continuity-requests/:requestId` without command state. It accepts only a strict response matching the original request ID.
- `diagnosticExecuteContinuityRequest(B, requestId, input)` POSTs the strict shared `{kind, command}` discriminated union to `/diagnostics/orders/:B/continuity-requests/:requestId/execute`. Its response must match request ID and kind. No ID-only execute exists.

Each action dispatches at most once. There is no automatic repost, reprepare, renewal, fallback read, persistent cache, localStorage, service worker or command store. Future approved UI may explicitly discover/recover after reload under the same current Session; no UI flow is supplied here. Pending means `pending_input`, not saved input or proof admission. Issue completion returns the original `proofId` with `usability: historical`, never current usability. Current dual reviewer authority remains enforced upstream for issuance recovery. Completed consumption recovery is the strict request envelope plus only `{proofId, reportId}`, under current B-only upstream authority. It does not fetch A detail or full proof material. A request ID is not authority; cross-sign-in adoption is not introduced. Existing ordinary B result discovery remains unchanged.

The Admin overview was inspected and left unchanged: these are additive internal actions, with no new ownership or UI boundary. The parent owns overview reconciliation. Governing evidence: [source contract](request-recovery-next-source-contract-20261023.md), [backend receipt](request-recovery-backend-receipt-20261023.md), [existing identity transport](protected-admin-identity-transport-20261023.md), and [header receipt](diagnostic-action-response-headers-20261023.md).

## Test-first evidence and verification

Only the two explicitly named, inspected no-listener Admin test files were executed. New tests invoke the actual feature actions and shared auth/origin/JSON bridge. Only Next request storage/navigation and external `fetch` are substituted. No feature action or repository helper is mocked.

Initial RED: 127 new cases fail because the four action exports are missing; all 31 unchanged identity-transport tests pass. This is missing-action RED, not an independently observed failure for each individual guard. First implementation run exposed three new-test fixture assumptions: JSON key ordering after strict schema parsing and absent versus explicitly undefined GET body properties. Those assertions were corrected without changing old tests. The final corrected test file was rerun against byte-exact original actions (`red-final.log`: 127 fail, 31 pass), committed and pushed as test-only RED; the saved implementation was then restored. The same corrected file passes GREEN (158/158 across two files) and is byte-identical from corrected RED through source GREEN.

| Criterion | Evidence | Result |
|---|---|---|
| Four actual actions, exact HTTP method/path/body and strict request/response allowlists | New neighboring transport test, real bridge and fetch boundary | PASS offline |
| Invalid B/request IDs, strict queries, wrong kind/unknown command fields and opaque preparation | No-dispatch assertions through actual actions | PASS offline |
| Expired Session before validation, missing token, wrong token/upstream authority, missing/wrong Origin | Actual shared request/auth/origin bridge | PASS offline |
| Upstream denial/conflict/redirect/non-JSON/malformed/declared and chunked oversize, fixed error sanitization | Response-boundary tests; one request and no data release | PASS offline |
| Lost issue/consume reply followed by explicit discovery/recovery | One POST then two GETs, original ID/outcome, no command bodies on reads or A fallback | PASS offline |
| Historical issuance; pending contains no command; B completion excludes predecessor/customer/identity/reason/reviewer/notes/evidence/hashes | Strict returned projections and rejection tests, including nested discovery entries | PASS offline |
| Existing actions/tests/helpers/proxy/header wrapper and backend source preserved | Parent-relative diff and byte-preservation script | PASS offline |
| Admin lint, TypeScript 7, TypeScript 6, production build | Named commands below | PASS |
| Root runtime imports | Cannot resolve `@auto-tm/db` from this Admin-only checkout | BLOCKED; unchanged package boundary, parent environment owns completion |
| Real API authorization/SQL concurrency/disposal/worker behavior | Prior backend receipt remains governing evidence | UNKNOWN |
| Final Next action-envelope exact private/nosniff headers | Proxy emission remains insufficient; framework unchanged | UNKNOWN |
| UI, independent Standards/Spec review, hosted CI and deployed/native/release acceptance | Parent/founder gates; no polling or prohibited verification | UNKNOWN |

Build succeeded with the existing `src/instrumentation.ts:14` Edge Runtime warning about `process.exit`; that file is unchanged. The root runtime-import failure was preserved without expanding into DB setup or alternate verification. Admin build and contracts import compilation pass. Docs: not applicable — internal composition of existing repository transport and DiagnosticSchemas; no dependency/version or external-service change.

No package-wide unit suite, root test suite, wildcard suite, runtime session smoke, standalone-assets script, local HTTP/TCP/SMTP/TLS listener, Docker/database/service/e2e/browser/device/emulator/screenshot, CI poll/rerun/dispatch, infra/deploy/reset/credential lookup, signing/store action or worker timeout change was performed. Prior Railway refusals remain terminal. Founder retains joint manual emulator testing. Broader generic workflow gates are intentionally excluded by this dispatch, not reported as passing.

## Commands and log hashes

All logs and `commands.jsonl` are in `/tmp/issue-923-admin-transport-20261023`. The runner records exact argv, cwd, exit and SHA256; its own invocation prefix is `python3 /tmp/issue-923-admin-transport-20261023/run.py <log-name>`. Initial reservation used `git switch -c agent/issue-923-request-recovery-admin-20261023 af79cad807799d0acc7843759c1b9a05d456c424` then `git push -u origin agent/issue-923-request-recovery-admin-20261023` (both exit 0). An initial runner invocation used unavailable `python` (exit 127 before executing the build); rerun used `python3`. Later final docs/diff/preservation/push logs are supplied in the final artifact manifest.

| Log | Exact command | Exit | SHA256 |
|---|---|---|---|
| `contracts-build.log` | `pnpm --filter @auto-tm/contracts build` | 0 | `577eb49f4a1fa3ef4564542b18596b9b8d59d35b354368506c0f2f0013003193` |
| `red.log` | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/request-recovery.transport.spec.ts src/app/diagnostics/identity-transport.spec.ts` | 1 | `d37b226dbf606b5e5762c6cede61a1375bae12dcabc2bb2d241a6bdf5333a850` |
| `red-commit.log` | `git add apps/admin/src/app/diagnostics/request-recovery.transport.spec.ts` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `red-checkpoint.log` | `git commit -m 'test(admin): specify protected request recovery transport'` | 0 | `ad00bbbf17c318af54b1caa89cd85c045a2a0beb99834693fc8f205c9c032acd` |
| `red-push.log` | `git push origin agent/issue-923-request-recovery-admin-20261023` | 0 | `497b76dbeec9f740524560049a05df084d4b9f9af730cc75b5846b0524648c68` |
| `green.log` | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/request-recovery.transport.spec.ts src/app/diagnostics/identity-transport.spec.ts` | 1 | `22475a81ad7dd0ef30ab3bed303b7d1b151c027dcc72620dbd8461ff7e8b1935` |
| `green-corrected.log` | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/request-recovery.transport.spec.ts src/app/diagnostics/identity-transport.spec.ts` | 0 | `afcf474cd050fe34a727579a5b33696ddae76d3c98b34de20122d785d0f4a586` |
| `red-final.log` | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/request-recovery.transport.spec.ts src/app/diagnostics/identity-transport.spec.ts` | 1 | `57570d25428fa9adc4538ba1792d6c7727b7e83b3a01b7f43da7987bfbc485ea` |
| `red-fixture-checkpoint.log` | `git commit -m 'test(admin): align transport assertions with parsed JSON and absent GET body'` | 0 | `d4b026f1db256480145feeb5177e16263bae950a5436aac1bfad5af2b4282cd6` |
| `red-fixture-push.log` | `git push origin agent/issue-923-request-recovery-admin-20261023` | 0 | `d92a5d043f702eb64f4a0e76b12da75f34a30544fe10807acb398f3ff15f8503` |
| `parent-docs-merge.log` | `git merge --no-edit 7bfe53968066cc28a80223f1f5fcc71f0808330b` | 0 | `cefb29304341f54005948d4ad7cfab377921ab685acf492be5005d03f3143586` |
| `green-final.log` | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/request-recovery.transport.spec.ts src/app/diagnostics/identity-transport.spec.ts` | 0 | `2acb637a69b082cf4292894aa9a367f801db624e2791e6d33a144668da99114d` |
| `admin-typecheck.log` | `pnpm --filter @auto-tm/admin typecheck` | 0 | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| `admin-ts6.log` | `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `admin-lint.log` | `pnpm --filter @auto-tm/admin lint` | 0 | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `admin-build.log` | `env API_BASE_URL=https://api.example.invalid/api/v1 pnpm --filter @auto-tm/admin build` | 0 | `6d3963b8bd80a9701ecd3588ec547af246e992fd8b29f0c1ec0883d4468c0969` |
| `runtime-imports.log` | `pnpm check:runtime-imports` | 1 | `ebc0c38f6eef23fcff18b5851889a63a8310e7359bbeeb736b2855b9428b93da` |
| `source-diff-check.log` | `git diff --check` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `source-checkpoint.log` | `git commit -m 'feat(admin): bridge protected opaque continuity request lifecycle'` | 0 | `35e8461c519dda298af817b60b5fb48a35729b5d1712d539de9d6ea71ae0e401` |
| `source-push.log` | `git push origin agent/issue-923-request-recovery-admin-20261023` | 0 | `ffaa0eff0f9fd864e0ff792f397e14e0b071b3bd7317e4e847bd62dbd0a5b1d8` |
| `docs.log` | `pnpm check:agent-docs` | 0 | `8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20` |
| `glossary.log` | `pnpm check:glossary` | 0 | `d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621` |
| `preservation.log` | `python3 /tmp/issue-923-admin-transport-20261023/preserve.py` | 1 | `22ab2c7dc6341e1cb816e14a0482ace98e9bc56e0e6f5e7294eddc71765de4fc` |
| `preservation.log` | `python3 /tmp/issue-923-admin-transport-20261023/preserve.py` | 1 | `22ab2c7dc6341e1cb816e14a0482ace98e9bc56e0e6f5e7294eddc71765de4fc` |
| `preservation-final.log` | `python3 /tmp/issue-923-admin-transport-20261023/preserve.py` | 0 | `a6745e5142e91350538336a6e23911a4b89be4d5e9176f607f4cc17dce99848e` |

The first preservation script failed on Git-quoted Unicode asset paths before completing; the corrected script compares NUL-delimited tree entries and passes. Product bytes were unchanged by this tooling correction. Source diff SHA256: `0da5b61fbaba8e19f3154e83ae12da305e2f8a63586cf93487ae76eb4cdcf891`. Actions SHA256: `80f766d34aa690733e2e19bae032da01cc45e5f3811ae5fba5c9602c579d9c3e`. New test SHA256: `f1fec63762c778dfd837b1cb369eff4b53b66f0984d7ba64f292df93c8344d1c`.

## Handoff

Owned delivery paths relative to incorporated parent are `apps/admin/src/app/diagnostics/actions.ts`, new `apps/admin/src/app/diagnostics/request-recovery.transport.spec.ts`, and this receipt only. The source checkpoint changes only the first two. `source-diff.patch` and `source-manifest.json` pin the exact source delta and file hashes; final `delivery-diff.patch`, `delivery-manifest.json` and `artifact-manifest.sha256` are returned with the clean pushed head. Incorporation also brings the parent's diagnostics/worker overview and backend-receipt changes; those are not this writer's edits.

Next action: Chief of Staff inspects and assembles this pushed branch into sole draft PR #904, preserves the runtime-import limitation, obtains independent review and hosted acceptance, and resolves the final action-envelope header evidence before accepting that requirement. No issue closure, operational readiness or UI recovery completion is claimed. Stop after this handoff.
