# Protected Admin diagnostic identity transport, 2026-10-23

Bounded implementation for #923 within #897 and sole [PR #904](https://github.com/Carberk/carberk/pull/904). This is an offline transport checkpoint, not full #923, real-service acceptance or release completion. The existing strict API and contracts retain all authority and lifecycle decisions. Governing evidence is [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md), [B handoff API](diagnostic-b-handoff-api-20261023.md), [staff foundation packet](diagnostic-staff-ui-foundation-packet-20261022.md) and the founder-approved limited B-only handoff. Supported same-visit manual/VIN corrections remain append-only upstream behavior.

## Ownership and checkpoints

- Owned host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-74b71e27`, canonical branch `agent/issue-923-protected-admin-transport-20261023`, reserved/pushed before source edits. Base verified at startup as `be2f5b39e989b49ab65d66712ea7d568db68fa06`. Host scaffold `t3/74b71e27` is preserved unchanged at that base.
- Initial missing-action RED `3bcefdf2`. Behavioral origin-refusal RED `494442fe`: malformed browser Origin returned generic invalid-input instead of uniform denied; one failure and 69 passes in the two-file suite. The earlier missing-action RED loaded the existing action module but found the new functions absent; it is not a separate byte-route behavioral RED. File-route cases provide regression evidence, without claiming an independently observed preimplementation RED for every guard.
- Separately cherry-pickable fixture-only correction `57dff9b3`, one API e2e test file only. Its ancestry contains the Admin RED checkpoint; cherry-pick this commit alone for the urgent fixture correction.
- Source GREEN `3f900547c302c19e2a5ad158f43915d224699f2d`, tree `25f1e4332af4632746411ca9044df8e7196b15a0`. This evidence-only commit follows it. All checkpoints push only to the owned issue branch; no issue PR or integration push. Chief of Staff owns assembly and the parent execution record. PR #904 was linked to this thread.

## Transport behavior

New actions read order identity records and structured evidence, stage classified provenance, append complete evidence/corrections, read the exact reinspection comparison, discover scoped predecessors and currently eligible B technicians, discover B-only handoffs/results, read/issue full restricted proofs and consume the existing strict B-only command. They do not alter `diagnosticIntake` or its vehicle envelope. Full proof/history/comparison requests use their independent upstream guards. B-only discovery and consumption use only the strict B projections and reject extra upstream fields. No full-pair fallback or client continuity decision exists.

Every action rejects the proxy's expired-session marker first, validates browser mutation Origin against configured Admin origin or current Host, gets current HTTP-only cookie authority and makes one fresh upstream request. UUIDs, bodies and queries use strict existing contracts. Errors return fixed public codes, never upstream messages/codes, tokens or locators. Fetch uses no-store, manual redirect refusal and a 30-second signal; there is no automatic repost, storage, browser cache or protected-data recovery state. Full proof data is historical restricted data, not a client usability claim. Handoff usability remains the current upstream projection.

New byte paths are `/diagnostics/orders/:id/identity-provenance/:file` for GET/PUT and `/diagnostics/orders/:id/reinspection-comparison/provenance/:file?predecessorId=:report` for GET. Each forwards the exact order, provenance and pair identifiers to the corresponding guarded API endpoint with current cookie authority. GET accepts no unrelated query; PUT accepts only canonical nonnegative safe-integer `expectedOrderVersion`; pair GET accepts only the UUID predecessor. Duplicate and extra query keys refuse. PUT additionally checks current-session marker, Origin, octet-stream content type and JPEG/PNG/WebP declared evidence type before collecting bytes. Upstream classification, current rights and staged intent are still mandatory; this transport never manufactures them or claims local authority over them.

Configured transport limits in `diagnostic-transport.ts` are 10 MiB per uploaded or retained image and 8 MiB per JSON projection. The image upload bound matches the stage contract. JSON/history larger than the bound refuses as a whole, without truncation or an absence claim. A declared oversized or malformed length refuses before reading; chunked streams cancel on the crossing chunk. No unbounded `arrayBuffer` runs in production. Reads buffer the entire bounded image before exposing any bytes, accept only upstream sanitized `image/webp`, and never forward Location, storage headers or raw storage redirects. All new file-route successes and failures carry `Cache-Control: no-store, private` and `X-Content-Type-Options: nosniff`.

Server Action HTTP headers belong to Next. The installed action handler sets `no-cache, no-store, max-age=0, must-revalidate`; these actions also fetch upstream with no-store. This slice does not establish a custom `private`/`nosniff` HTTP-header guarantee for Server Action envelopes. Such a guarantee would require the integration owner to authorize a proxy/configuration change outside this writer's scope. File-route header coverage is proven offline. No UI/components, visual behavior, storage keys/URLs in DTOs or public/commissioner disclosure were added.

## Urgent hosted handoff fixture correction

Parent supplied exact-base CI run `39917761521`, raw-log SHA256 `3e6c37ce1f058ce445af360dca1f4d89482a7210072bd53a378d50bc0e59c9f5`. The local plain log `/tmp/carberk-resume-20261021/be2-api-plain.log` independently hashes to `01b713b3d5b18529321a07ede9ec336f0d616ac2e305e5d1e286de949c39da09`. These are different artifacts. At original lines 1352, 1376 and 1412, the old fixture helper asks the deliberately deassigned technician to read A's current version. HTTP 403 is correct. Main concurrent B-only consumption/result assertions had already been reached. The new section-local helper reads A as its still-current reception actor through ordinary GET, passes that real returned version to the existing reception assignment POST and retains its returned version. It can also reassign R after both T and R lose A. It never grants T access again or uses R as a version-reader after R loses access.

The issuer-grant expectation at original line 1382 is corrected from 201 to 204. `StaffController.grant` explicitly declares `@HttpCode(204)`, and unchanged `StaffAuthorityHttp.spec.ts` already requires 204. No product assertion or 403 denial was removed. All pre-handoff bytes remain identical; after normalizing the five new assignment-call substitutions, section-local helper and status correction, the new section is otherwise identical too. Static preservation and compilation do not prove the repaired real-service journeys. Their hosted GREEN remains UNKNOWN.

Parent reports source discovery and public A-only draft/finalized erasure/PDF/B-result recovery passing on the exact base. Those are parent-supplied historical facts, not acceptance of this checkpoint. Automatic 403-versus-201 and three historical reset tails remain outside this slice. Worker timeout work is untouched.

## Criterion status and limitations

| Criterion | Evidence | Status |
|---|---|---|
| Current-session strict Admin identity/classification/evidence/pair transport | 75 new network-boundary tests, real actions/routes/helpers/contracts and fetch/framework boundary fakes only | PASS offline |
| Malformed UUID/query/body/Origin, current session loss, rights/null hold, MIME, declared/chunked byte bounds, protected errors/redirect refusal | Same tests; exact 10 MiB success and oversized-stream cancellation; no token/locator error forwarding | PASS offline |
| B-only minimal projection, current discovery/selection and strict consumption versus full proof transport | Action tests and unchanged 40-case API handoff/discovery injection suite; no A projection added | PASS offline transport only |
| Existing Admin behavior and original diagnostics fixtures/assertions | Full Admin 405 tests; preservation comparisons; existing evidence/workspace tests unchanged | PASS offline |
| Three unauthorized fixture version reads and one wrong grant status | Separate `57dff9b3`; API TS7/TS6/lint and focused injection regression | Corrected source; hosted UNKNOWN |
| Issuance lost-reply deduplication and persisted consumption request/recovery | No new persistence or retry protocol; callers must retain exact existing command binding | NOT SOLVED; remains parent scope |
| Action envelope custom private/nosniff headers | Next owns response headers; no proxy/config edit allowed | Not established; integration scope prerequisite |
| Real HTTP/SQL/storage/current-authority/concurrency/retention/erasure acceptance | No disposable services or e2e executed | UNKNOWN; parent hosted gate |
| Rendered visual/native/deployed acceptance and release | No UI edit, design bypass, browser/device/deployment/build-signing/store action | UNKNOWN; remains gated |

No Docker or local listening services, e2e run, Railway action, credential search, reset, CI poll/rerun/dispatch, nested agent or quota query occurred. The three Railway refusals remain terminal. Admin production build and contracts/DB generation/compilation were the only build operations. Initial DB generation required `DATABASE_URL`; a nonconnecting loopback placeholder was supplied only for generation/typecheck. No database connection, schema application or service startup occurred. Admin `verify:runtime` was not run because both configured scripts start loopback API/Next services. Repository-wide unit execution also contains listening HTTP tests and was not run under the no-services restriction. Focused Admin units and the no-listener Fastify injection suites above ran instead. No runtime acceptance is inferred from compilation.

Docs: not applicable for external lookup. Internal transport additions use existing installed Next/Zod/fetch interfaces; no dependency, version or package-boundary change. Existing overview ownership/constraints remain intact, and shared CONTEXT files were explicitly excluded. No source outside the authorized Admin files and single added API fixture exception changed.

## Commands and log manifest

All artifacts below are in `/tmp/carberk-923-admin-transport-20261023`. `commands.json` contains these exact commands/results/digests, and `SHA256SUMS` is the manifest. SHA256 authenticates the local log bytes, not runtime acceptance. GREEN logs apply to the source GREEN tree above, with five additional type/length regression cases after the behavioral RED. Empty lint/typecheck logs legitimately have the empty-file SHA256.

| Log | Result | Command |
|---|---|---|
| `red-actions.log` | RED, 20 missing-action failures | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/identity-transport.spec.ts` |
| `red-origin.log` | RED, 1 failure / 30 pass | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/identity-transport.spec.ts` |
| `red-transport.log` | RED, 1 failure / 69 pass | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/identity-transport.spec.ts src/app/diagnostics/identity-files.transport.spec.ts` |
| `green-transport.log` | PASS, 75 tests | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/identity-transport.spec.ts src/app/diagnostics/identity-files.transport.spec.ts` |
| `green-focused.log` | PASS, 76 tests before five added boundary cases | `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/identity-transport.spec.ts src/app/diagnostics/identity-files.transport.spec.ts src/app/diagnostics/evidence-proxy.spec.ts src/app/diagnostics/DiagnosticWorkspace.transport.spec.tsx` |
| `admin-unit.log` | PASS, 405 tests / 37 files | `pnpm --filter @auto-tm/admin test:unit` |
| `admin-lint.log` | PASS | `pnpm --filter @auto-tm/admin lint` |
| `admin-typecheck.log` | PASS | `pnpm --filter @auto-tm/admin typecheck` |
| `admin-ts6.log` | PASS | `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` |
| `admin-build.log` | PASS | `API_BASE_URL=https://api.example.invalid/api/v1 pnpm --filter @auto-tm/admin build` |
| `api-lint.log` | PASS | `pnpm --filter @auto-tm/api lint` |
| `fixture-lint.log` | PASS | `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts --max-warnings 0` |
| `api-typecheck.log` | PASS | `pnpm --filter @auto-tm/api typecheck` |
| `api-ts6.log` | PASS | `pnpm --filter @auto-tm/api exec tsc6 --noEmit` |
| `handoff-boundary.log` | PASS, 40 tests / 2 files, Fastify injection without listeners | `pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts` |
| `repo-typecheck.log` | PASS | `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm typecheck` |
| `contracts-build.log` | PASS | `pnpm --filter @auto-tm/contracts build` |
| `db-build.log` | PASS, generation/compilation only | `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build` |
| `runtime-imports.log` | PASS | `pnpm check:runtime-imports` |
| `agent-docs.log` | PASS | `pnpm check:agent-docs` |
| `agent-docs-with-receipt.log` | PASS, receipt included | `pnpm check:agent-docs` |
| `receipt-diff-check.log` | PASS, receipt included | `git diff --check` |
| `diff-check.log` | PASS | `git diff --check be2f5b39e989b49ab65d66712ea7d568db68fa06 HEAD` |
| `fixture-preservation.log` | PASS, static preservation only | `Python exact prefix and normalized new-section comparison against be2f5b39` |
| `admin-preservation.log` | PASS, static preservation only | `Python exact existing actions comparison against be2f5b39` |

```text
26c0f1e9e68ab160a8589a7d701a2629cb0b1a749f1af35136984acdaef2acc1  red-actions.log
d5398fd997b88c3a16566e96fbbeb0a5910282cd56ddebe39eac11e51a55d321  red-origin.log
94afd4f14fecf023c0db74b502165be91dfc5a5951781a8e456d0abc2543f3c2  red-transport.log
3f3220874b41f67c83417a5e0ac634731d2cdfc7f4803c7cfc180438f38a551e  green-transport.log
cba000d50d3ecb6f089922c99c3172f1693683488c53e24c8779cf98c47e54db  green-focused.log
76776dbba0130793f742bc65128c0c1a7f25d52f61fa6b7290ee327361a2c676  admin-unit.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  admin-lint.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  admin-typecheck.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  admin-ts6.log
5dafd279ccff760d3671af85a050b18294dcd45db5538394fb66f838adf7df48  admin-build.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  api-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  fixture-lint.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  api-typecheck.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-ts6.log
85c33b0237df4b49b495e6cbef7a77c344202c4cab0a5cbdae9a29fc9cc8886f  handoff-boundary.log
98b99b183be261c563b93a588b40f9114f9fdab909356e1d9a89d82b389e5643  repo-typecheck.log
b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616  contracts-build.log
5d9d94778c4cb48f3caa342d0871d1b262ff0f893f4f169ee768b13c1ca0d886  db-build.log
2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97  runtime-imports.log
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  agent-docs.log
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  agent-docs-with-receipt.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  receipt-diff-check.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  diff-check.log
933f2df613f27f4dfa74243b77f957f3878351ed86d9344146a9ba0ff58da8cb  fixture-preservation.log
ae27499ce44b3e033feea15c982aa9735a292cd09e57e1bc9a851e7080deaf99  admin-preservation.log
```

## Exact changed files and next handoff

- `apps/admin/src/app/diagnostics/actions.ts`
- `apps/admin/src/app/diagnostics/identity-files.transport.spec.ts`
- `apps/admin/src/app/diagnostics/identity-transport.spec.ts`
- `apps/admin/src/app/diagnostics/orders/[id]/identity-provenance/[file]/route.ts`
- `apps/admin/src/app/diagnostics/orders/[id]/reinspection-comparison/provenance/[file]/route.ts`
- `apps/admin/src/lib/diagnostic-identity-files.ts`
- `apps/admin/src/lib/diagnostic-transport.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts`
- `docs/evidence/issue-897/protected-admin-identity-transport-20261023.md`, this receipt.

Chief of Staff should inspect/cherry-pick the owned checkpoints into the sole integration candidate, retain the urgent fixture commit separately if useful, resolve the action-envelope header prerequisite if required, then obtain hosted disposable-service evidence and the existing independent review/acceptance gates. Persisted request recovery is still an explicit open #923 requirement. No integration push, full #923 completion or release readiness is claimed.
