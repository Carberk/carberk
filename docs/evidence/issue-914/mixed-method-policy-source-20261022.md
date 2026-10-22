# Mixed-method comparative policy source round

This isolated #914 writer starts at `9e99280b632f1740512ea1093f18dc24533f4278`, tree `b3735634dd592513d10d9f203d57c7c7942e0995`, on `agent/issue-914-mixed-policy-20261022-c3225aa2`. Root alone assembles into #897 through draft PR #904. No issue PR or integration push is authorized.

## Test-first checkpoint

Before production edits, `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts` freshly ran 25 cases: two mixed positive failures and 23 passes. Both failures are `DIAGNOSTIC_NO_ACCESS` at the existing manual-only comparative guard, source line25, rather than setup failures. Existing 14 cases and nine new negative cases passed. The negative raw VIN041/stamp999 cases already pass under the current blanket mixed refusal; that does not establish safety after admission changes.

The two positive cases use actual policy input with raw VIN041, retained stamp041 and shared chassis041 in both directions. Expected dates are literal. Negative cases cover conflicting stamps despite shared chassis, absent raw VIN/stamp, absent/different/contradictory common physical evidence, either side's expired evidence and expired comparison provenance. VIN/VIN comparative remains outside this bounded change.

RED log: `/tmp/issue-914-mixed-policy-c3225aa2/domain-red.log`, SHA-256 `e0c8580b178efc1ea51869bb3c9d39154c2eebc58dab6e597ca748d9e2321ea6`. The first attempt encountered missing compiled workspace packages. Initial DB generation also required a placeholder DATABASE_URL, then the contracts build prerequisite. Contracts and DB were built in dependency order with a nonconnecting offline placeholder; no services started. Those setup attempts are not criterion RED.

The committed [c4 hosted receipt](../issue-897/public-transfer-assembly-and-c4-hosted-receipt-20261022.md) independently establishes reached HTTP issuance403-versus-required201 for both existing mixed positives. The [fixture repair assembly](../issue-897/fixture-oracle-attempt2-assembly-20261022.md) establishes the retained fixture baseline. The prior `/tmp/issue-914-mixed-source-security-audit-20261022.md` shows why guard removal alone is unsafe. This writer will not run hosted HTTP, Railway, resets, local services or CI operations.

The host reports Codex gpt-6.1-sol at high effort and provides no in-place effort setting. Repository medium implementer guidance was inspected; no replacement agent, child or provider probe was used. The supplied already isolated worktree is the only owned checkout.

## Source boundary and new HTTP refusal sibling

RED checkpoint `06651890913e5e175ab305c766485af8e3ae93ce` was committed and pushed before production edits. The same focused command then freshly passed all 25 domain cases. No existing domain case was edited; the original 5,293-byte prefix remains SHA-256 `b727fc9b88617c159b1bdae843e6141cd23156c70b653423c7cac6c6a9e4f8b7`.

The production change is confined to `PrivateContinuityAttestation.ts`. Comparative admission now accepts one manual and one VIN visit when the VIN side has a nonempty normalized raw VIN and at least one retained VIN stamp, with every retained VIN stamp agreeing with that raw value. The unchanged shared policy still requires a common physical identifier, refuses any common-kind contradiction and bounds retention by all supplied evidence/provenance rights. VIN/VIN comparative admission remains refused. Automatic eligibility and manual/manual policy are unchanged. No broad corrected-record rejection was added; flattening and current correction/rights semantics remain unchanged. Original/descendant conflicts require the later explicit graph-aware round, and equal VIN never moves them into automatic admission.

The existing caller already passes the pinned raw method/VIN, full flattened retained identifiers and chain rights to this interface. No caller change was necessary. Transaction ownership, sorted identity/feature locks, post-lock Session/grant/qualification/assignment checks, private same-commissioner/audience gates, bound pair versions/digests, permanent unused-proof invalidation, audit rollback, exact retries and consumed-link survival remain in unchanged source. Public fallback is unchanged.

New `DiagnosticMixedIdentityConflict.e2e.spec.ts` declares two serial ordinary HTTP cases, one per mixed direction. It composes real Nest, Prisma and private S3 storage using the existing clock/runtime boundary fixtures. It captures raw VIN041 and retained VIN stamp999 only on the VIN visit, while both visits retain chassis041. Before issuance, each case requires exact raw/evidence responses, A release and immutable snapshot, full restricted comparison, both literal sanitized image downloads with exact byte lengths and SHA-256 hashes, and current independent reviewer/technician Sessions, grants, qualifications and assignments. The linking technician differs from the reviewer. It requires generic 403/private-no-store with no protected identifiers, hashes, rationale or object keys, no proof/report/audit residue, and unchanged orders/raw/evidence/provenance/report/snapshot/PDF rows. It rereads comparison and both exact downloads after refusal.

Fixture setup adds read-only collision fences for deterministic principals/Sessions/center/qualifications and request-owned order keys, report ids, provenance ids/object keys and evidence ids. Request-time registries include intake-created reception assignments. Raw registration requires exactly the one expected record created by the observation request; it never adopts extra discovered rows. Cleanup retains the reviewed all-descendant preflight before any object/database mutation, then exact registered objects with HEAD 404 checks, proof/PDF/report pins, and guarded parent-order cascades. There is no direct immutable child DELETE, guard bypass or discovery-based ownership expansion. Unknown descendants or failed object cleanup preserve database rows. The new cleanup has not executed locally; its runtime remains part of Root's hosted gate.

`diagnostics/CONTEXT.md` corrects only the affected mixed-method boundary and the related stale automatic-hosted limitation. No inventory expansion, dependency, schema, contract, CI, guard, budget, timeout, reset or architecture changes were made.

## Verification and freshness

All paths below are under `/tmp/issue-914-mixed-policy-c3225aa2/`. Direct commands freshly executed unless explicitly marked cached. No container-backed or destructive suite ran.

| Command / criterion | Result and log |
|---|---|
| Focused domain command above before source | Genuine RED, 2 failed/23 passed; `domain-red.log` |
| Same focused domain command after source | GREEN 25/25, fresh; `domain-green.log` |
| `pnpm --filter @auto-tm/api typecheck` | PASS configured TypeScript7, fresh; `api-typecheck.log` |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS, fresh; `api-ts6.log` |
| `pnpm --filter @auto-tm/api lint` | PASS entire API, zero warnings, fresh; `api-lint.log` |
| `pnpm --filter @auto-tm/api build` | PASS Nest build, fresh; `api-build.log` |
| First `pnpm test:unit` | FAIL five existing AdminApiBridge cases because filtered install lacked `next/navigation`; API 2,445 pass/two skips,9/10 tasks successful and9 cached; `root-unit.log` |
| `pnpm install --frozen-lockfile` | PASS all 12 workspaces, lockfile unchanged; `install-workspaces.log` |
| Repeated `pnpm test:unit` | PASS 10/10 tasks,9 cached; API freshly ran 261 files, 2,450 pass/two existing skips; `root-unit-after-install.log` |
| `pnpm typecheck` | PASS 11/11 tasks,10 cached; API fresh; `root-typecheck.log` |
| `pnpm check:agent-docs` | PASS links/headings/map/shared policy; `agent-docs.log` |
| `pnpm check:runtime-imports` | PASS both shared runtime packages; `runtime-imports.log` |
| `pnpm check:glossary` | PASS 31 terms; `glossary.log` |
| Import-only `vitest list --config /tmp/issue-914-mixed-policy-c3225aa2/collection.config.mts --staticParse=false --json` | PASS 108 declarations, empty stderr; `collection.json`, `collection.stderr`, `collection-counts.json` |
| Full base-file comparison and `git diff --check` | PASS; `preservation.py`, `preservation.json`, manifests below |
| Hosted existing mixed positives / new HTTP refusals | UNKNOWN on this source candidate; Root owns the gate |

Root commands used `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` only as a nonconnecting generation placeholder. API unit configuration disables test databases. The first root unit failure was dependency installation, not a product-policy failure. Initial missing-build setup output is in the tool transcript; only the genuine RED and subsequent verification logs are preserved as files. Cached workspaces are cache reuse, not fresh runtime execution.

The temporary collection config has absolute paths to only the selected eight continuity specs and empty `globalSetup`/`setupFiles`; actual imports ran with `--staticParse=false`. No hooks, test bodies, services or HTTP setup ran. Original selected 106 names and files exactly match Root's prior attempt-two collection after normalizing checkout prefixes: original comparative 99, mixed 2, automatic 1, consumed-erasure 1, C1 one, C2 one, P1 one. New refusals add 2, total 108. This is registration evidence only. Full API unit execution independently includes the 25 domain cases.

## Preservation and handoff

Against the exact supplied base, all 4,143 existing tracked paths were compared byte-for-byte using base git blobs. Only the three allowed existing paths differ. The other 4,140 paths and all 97 existing E2E files are byte-identical, including original 99, mixed positives, automatic, consumed-erasure, C1/C2/P1, campaign/reset/security, guards, schema, contracts, CI and budgets. Manifests record each base blob, mode and base/current SHA-256, rather than inferring preservation from a scoped diff. `base-file-manifest.json` SHA-256 is `397bcbd6bf148c04c1edc6d8d3b40b057d133dd1e8b4cd8713e725c20d8e21f8`; `existing-e2e-manifest.json` SHA-256 is `c29765a2ad7a7cd74215049c3f008a497ca33e8b9a8e751628310c39a446d37b`.

Exactly five final paths:

- `apps/api/src/modules/diagnostics/domain/PrivateContinuityAttestation.ts`
- `apps/api/src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts`
- `apps/api/src/modules/diagnostics/presentation/DiagnosticMixedIdentityConflict.e2e.spec.ts` (new)
- `apps/api/src/modules/diagnostics/CONTEXT.md`
- `docs/evidence/issue-914/mixed-method-policy-source-20261022.md` (new)

Docs: no dependency or external service interface changed; repository source/contracts and configured tool APIs supplied the necessary information. No external documentation lookup was needed. Final checkpoint head/tree and clean pushed state are reported in the writer handoff after this note is committed, avoiding a self-referential commit hash.

Root must inspect/assemble and obtain hosted HTTP evidence for the preserved mixed positives and new refusals. C1/C2 graph resolution, public transfer/publisher authority, broader automatic issuer eligibility, the unrelated Improvement failure and remaining release security/worker/native/deployed gates remain required release work. No broader runtime GREEN, independent review or release acceptance is claimed. No children, provider/quota probes, Railway operations/refusal retries, credential discovery, resets, local service start, CI dispatch/rerun/cancel/poll, external messages, integration push, merge, promotion, store submission or launch occurred.

Selected log SHA-256 values:

- `domain-red.log`: `e0c8580b178efc1ea51869bb3c9d39154c2eebc58dab6e597ca748d9e2321ea6`
- `domain-green.log`: `c0294f9cdd54ac944933f6e6d3142cb23951673906bd869fcfc13b91ba0ae6ed`
- `root-unit.log`: `e03e430e4b6c240f102eaf45800da13af0303181c7f600b517edc5ecfb5f5929`
- `root-unit-after-install.log`: `b015a7f3bb9a8a1a66d5577844ef779c7537b5212d3fb01cd146415c89ece955`
- `root-typecheck.log`: `e89a374df3738b33a15c8a67343771530f24200e7bc7e2657c2f07d23a3223e2`
- `collection.json`: `b73b7b58a1d37c080ef8aed1dc849fd888a6303fc55b234426b77cca6b0f177d`

All verification log hashes are in `/tmp/issue-914-mixed-policy-c3225aa2/log-hashes.json`.
