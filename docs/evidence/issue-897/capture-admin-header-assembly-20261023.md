# Capture, Admin and header assembly, 2026-10-23

Follow-up assembly for #897–#920 and approved #923, sole [draft PR904](https://github.com/Carberk/carberk/pull/904). This is source assembly and offline verification, not release completion, a new review round or final header acceptance.

## Ownership, ancestry and preservation

Owned checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-16724309`, branch `agent/release897-capture-admin-assembly-20261023`, started clean at parent-inspected `01a3c5f887708441d2b26cfa1ab4045385e685fe`, tree `157372f1436e69818cd9389a24a40ef79334f95a`. Parent independently matched all 40 earlier manifest artifacts, all input ancestry and the 18 capture blobs, then fast-forwarded its local root to that SHA. The prior receipt remains unchanged.

Conflict-free original merge `fb26688f7e94b8a6675f15b9d2b23e94c91465df`, tree `b2d9a0b1d1e1f76284b27d477d93cb9ea4794cc3`, has full parents:

- `01a3c5f887708441d2b26cfa1ab4045385e685fe`
- `a3af742de70cb43515ca2ec9d31098c3c5d9fb79`

Header input tree is `225580cbc24849ce1d38a39cd234cfa0f1ab23b7`, based on Admin264 `264bf03871ce348bffa417cd7768ecd6263a0725`. It was merged with `git merge --no-ff`, never cherry-picked. Fresh `git fetch origin main` resolved `9fde309c3da17f2661fe9c266504e6e56a1b97c9`; reconciliation reported already up to date. The receipt-only checkpoint follows this verified merge. Final SHA/tree are returned in the handoff to avoid a self-referential commit identifier.

All eight input ancestry assertions pass: prior assembly01, header a3, Admin264, capture `f7dc2228caf98bc6bed462886cc5cb923deabbe0`, worker receipt `232c2841bf139d690b631fa637b3d4ce98393beb`, fixture `57dff9b3268024b82eb6b194aa47f9510856825c`, remote integration `be2f5b39e989b49ab65d66712ea7d568db68fa06` and fresh main9fde. Exact trees, full merge parents and ancestry booleans are in `preservation.json`.

The merge adds only these three paths, byte-exact to a3:

```text
apps/admin/src/proxy.ts
apps/admin/src/proxy-response-headers.spec.ts
docs/evidence/issue-897/diagnostic-action-response-headers-20261023.md
```

The only changed existing01 blob is proxy.ts, with the original 12-line header wrapper. Removing the wrapper and restoring the exported handler name reproduces the old handler byte-for-byte. All 927 existing tests identified by the broad spec/test/offline inventory pattern at01 remain byte-identical. All other01 source, capture SQL tests/helpers, all 18 capture blobs, prior receipts, overviews, budgets and assertions are unchanged. The only assembly-authored file is this new receipt. No feature repair, framework patch, policy invention or timeout workaround was made.

All 20 header receipt hashes independently match local artifacts, including the explicitly excluded standalone listener artifact. Hash identity does not make that artifact acceptable diagnostic evidence.

## Header boundary and execution deviation

The patch emits `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff` at the diagnostic proxy response boundary. It does not establish final Next Server Action response composition. Installed Next16.3.8 `dist/server/app-render/action-handler.js:493` replaces Cache-Control with `no-cache, no-store, max-age=0, must-revalidate`, dropping private. No-store still blocks caching, but exact final action-envelope private/nosniff acceptance remains UNKNOWN. No final HTTP proof is inferred from proxy tests or build success. The parent owns final runtime acceptance and persisted request recovery.

The header child mistakenly ran `verify-standalone-assets.mjs`, which started prohibited temporary fixture API/Next listeners. Its receipt records the deviation and cleanup; its artifact is expressly excluded from diagnostic acceptance. Parent independently confirmed no listener on17492. This follow-up did not run that script, verify:runtime, local application services, HTTP/Next listeners, Docker, e2e, devices, emulators, screenshots, signing, store, deployment, reset, Railway or credential operations. Three Railway refusals remain terminal.

Before running checks, the configured scripts, Admin Vitest config and test sources were inspected. The configured full Admin unit gate includes `src/lib/staff-session.spec.ts`, whose five tests create a real loopback HTTP listener. That unchanged file was explicitly excluded to honor the follow-up's no-listener constraint. Fresh unrestricted full Admin unit acceptance is therefore NOT claimed. Header child's 429 Admin pass is inherited evidence; current no-listener subset is 424 pass in37 files. No source/test/config file was changed to impose the exclusion. No broad root unit or root static suite was repeated after the parent's accepted01 results.

## Sequential offline checks

All checks below exited0. Commands ran sequentially. No timeout/retry/test-worker budget was modified. Full root typecheck passed11/11 tasks, with cache reuse explicit in its log. The focused134 tests include the24 new header tests. Admin production build retains the inherited Edge Runtime warning for instrumentation.ts process.exit; build exit is0, not warning-free. Targeted static schema inventory checks passed; unchanged broad static/reset evidence remains the accepted01 run of598 pass/1 skipped. No real SQL execution or forced race proof occurred.

Environment for all commands: AUTO_TM_TEST_DATABASES=off; DATABASE_URL and DIRECT_URL were the unreachable generation-only placeholder `postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:1/auto_tm_ci`; API_BASE_URL was `https://api.example.invalid/api/v1`. Package build dependencies are configured Turbo builds, not services. No connection is claimed.

| Exact command | Exit | Log |
| --- | --- | --- |
| `pnpm --filter @auto-tm/admin test:unit --exclude src/lib/staff-session.spec.ts` | 0 | `admin-unit-no-listener.log` |
| `pnpm --filter @auto-tm/admin exec vitest run src/proxy-response-headers.spec.ts src/proxy.spec.ts src/app/diagnostics/identity-transport.spec.ts src/app/diagnostics/identity-files.transport.spec.ts src/app/diagnostics/evidence-proxy.spec.ts` | 0 | `focused.log` |
| `pnpm --filter @auto-tm/admin lint` | 0 | `admin-lint.log` |
| `pnpm --filter @auto-tm/admin typecheck` | 0 | `admin-typecheck.log` |
| `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` | 0 | `admin-tsc6.log` |
| `pnpm --filter @auto-tm/admin build` | 0 | `admin-build.log` |
| `pnpm typecheck --concurrency=1` | 0 | `root-typecheck.log` |
| `pnpm check:runtime-imports` | 0 | `runtime.log` |
| `pnpm test:agent-docs` | 0 | `docs.log` |
| `pnpm check:glossary && pnpm test:glossary` | 0 | `glossary.log` |
| `node --test scripts/diagnostic-classified-ownership-schema.test.mjs` | 0 | `schema-static.log` |

Docs: no external dependency, framework API or version was changed by this assembly; the original header receipt preserves the official documentation references. Receipt-only work is exempt from behavioral RED. Exact merge/source preservation and documentation checks are alternative proof. No independent Standards/Spec review was dispatched.

Assembly-relative diff-check passes. Main-relative diff-check remains exit2 with the same nine trailing-blank warnings, byte-identical to01's main-relative diagnostic. They remain inherited and unedited. The overall main diff is not green.

## Open gates and durability

Full #897/#923, real-source rights, automatic admission, BOTH-visit irreversible witness, full source-writer closure, SQL execution/forgery/normalization parity, forced races, worker hosted timeout resolution, persisted recovery, fixed-SHA independent Standards/Spec review, exact-candidate hosted/deployed acceptance, signing and release gates remain OPEN. Parent is separately dispatching capture SQL race tests from01; this assembly does not touch their source or helpers. Worker attempt remains FAILED SAFE CORRECTION at its cap, not timeout repair. Source checkpoints do not establish release completion.

Published integration remains be2. Exact hosted run39917761521 is inherited API3451 pass/8 fail and worker375 pass/3 fail, with DB/static/frontend/lane pass and docs skipped. Four later handoff fixtures were corrected in inherited source, but new SQL/hosted status is UNKNOWN. Automatic403versus201, three historical reset tails and three worker timeouts remain. Header final-wire acceptance is UNKNOWN. Founder joint manual emulator testing remains after signed AAB and staging APK candidate.

Parent explicitly authorized pushing only this owned assembly branch for durability. The merge reservation was pushed with `git push -u origin agent/release897-capture-admin-assembly-20261023`; final receipt checkpoint is pushed to the same branch. No integration push, PR write, issue PR or hosted polling/rerun occurs. PR904 stays linked and unwatched in this child thread; parent owns publication and T3 hosted notifications. Worktree is retained for parent inspection.

## SHA-256 manifest

Artifacts are in `/tmp/897-capture-admin-header-assembly-20261023`. `commands.json` records exact command, exit, elapsed time and digest; `preservation.json` records input ancestry and unchanged blob assertions. Final handoff adds the receipt-only validation and final remote SHA check without repeating broad gates.

```text
22c607d8acea4b0909acd4b9294721f0578ac5df468f2c54e811cc7b32a00fe2  admin-build.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  admin-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  admin-tsc6.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  admin-typecheck.log
e99ab7da1baf4d646a56ea70794bd8e42bafa132ecc85e1bba1981cf0708d638  admin-unit-no-listener.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  base-diff-check.log
f6e494058a062517249e82118a8c7139b1571d6df15c593b5795ad43d62fdfbf  commands.json
da33d96479fdd9eb9b26d0b77828f048ec16b6a757dbf04988bd97d05774c4af  docs.log
496601c1e121fbbfc48faa31ff964c7004064923ae49ff41910b5bc5ef8694ec  focused.log
6b9607664e3b5ea749d04fee9cb8bce50dacc34d81c398a44c8cf52ed79c8ea2  glossary.log
e02f47da4789db1801c3e95b1a544d64937edbb6db64fa777f56ec242ba3bbdf  header-artifact-audit.json
911649a7dbbdc17d91175e05869eaec30b2f140df186cc22f0f78edd6788a8b4  inherited-main-diff-check.log
911649a7dbbdc17d91175e05869eaec30b2f140df186cc22f0f78edd6788a8b4  main-diff-check.log
9cd09862d7b404aa6c58f75c63b13221835336e29365d67d77e95ecd1ceb55c1  preservation.json
06016ff4aa68297e9734a568a9370eb0bbfc30a258245c97761bdd747bf24390  root-typecheck.log
2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97  runtime.log
471709c4e6b3c77c30855337187cce4e89a1bf0874ce015fe9e38bbf9c413b94  schema-static.log
```

Final receipt validation: `pnpm test:agent-docs`, exit0, 8 passed; `git diff --check`, exit0.

```text
30a2e852f40c2802311f51779fd90ca58a7a0a60dd70f93f0a7bd9c05314cb37  final-docs.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  final-diff-check.log
```
