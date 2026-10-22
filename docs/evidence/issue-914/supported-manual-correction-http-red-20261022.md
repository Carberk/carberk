# Supported manual recording correction HTTP checkpoint

This is one test-only C1 checkpoint for #914 within founder-selected #897–#920. Root is sole assembler through integration PR #904. No source implementation, PR or additional agent belongs to this checkpoint. C2 VIN correction and public transfer remain mandatory later work. The assembled M1/M2 fixture remains unchanged and its hosted result is not evidence for C1.

## Authority and reservation

Reused the T3-created isolated worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-6341a188`, initially clean on scaffold branch `t3/6341a188`. Its supplied base is `d072e812a71e2752dd6ca3b583e76d65f4cec501`, tree `edb2bc6ce6c52a51342483f0c47f1505e26f6242`. Created and pushed `agent/issue-914-manual-correction-http-red-20261022` from that exact base before editing. Opened no PR.

Read AGENTS, context map, API/diagnostics overviews, coding workflow, domain/standards/worktree/runtime guidance, run-issue/VERIFICATION, glossary and [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md). Section C1 of `/tmp/issue-914-mixed-corrected-next-red-plan-20261022.md` supplies contextual task details; accepted ADR-0108 owns policy. Inspected strict contracts, module/controller composition, identity capture/comparison, report/pin/PDF, proof/consumption adapters, `PrivateContinuityAttestation` and owning comparative, mixed, automatic, identity-binding and consumed-erasure tests.

`PrismaDiagnosticIdentityEvidence.append` checks the current raw observation, explicit current parent and new support, then increments order version and evidence generation once. C1 therefore expects A version 8/generation 2 after EC, while retaining its original version-6 raw observation and version-7 EA pin. `PrismaDiagnosticReports.compared` starts A at the immutable report pin and exposes its explicit descendants. Current proof code flattens EA/EC identifiers; `PrivateContinuityAttestation` rejects the old/new chassis values as conflicting. Source predicts 403. Only Root's actual hosted reached issuance result can establish criterion RED.

## Journey and setup gate

[DiagnosticSupportedManualCorrection.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticSupportedManualCorrection.e2e.spec.ts) independently collects exactly one positive C1 case. It uses real Nest/DiagnosticsModule/Fastify loopback HTTP, current Session/JWT, Prisma, Redis and private S3 boundaries. Only synthetic prerequisite actors, Sessions, grants, center and qualifications are seeded. Template publication and every diagnostic transition use ordinary HTTP. Database reads inspect immutable storage, restricted persisted bindings or prerequisite commissioner facts without an HTTP representation. No diagnostic report, proof, observation, pin, evidence or correction is seeded.

A/B have one nonnull private commissioner, no Listing, distinct visits, dual assigned T and independent currently qualified R, fresh physical authorization and confirmed then arrived appointments. The fixed clock is `2026-10-21T12:00:00Z`. A observes 10:00/123000; B observes 11:00/123100. Both are manual/null-VIN with descriptive references explicitly marked as non-proof. Literal intermediate order versions are checked through raw version 6 and structured capture version 7.

A records chassis `SYN-CHASSIS-04I` with PA, then releases through draft/finding/submit/independent finalize to report version 3. B independently captures `SYN-CHASSIS-041` with PB. Each also records the consistent physical `manufacturer_plate=SYN-MANUFACTURER-041` at the named synthetic plate location, bound to its own independently retained support. A subsequently stages/uploads new PC at current version 7 and appends EC superseding EA with chassis041, new PC and a nonempty I/1 recording-error explanation. No second `/vehicle` request occurs on A. EC is version 8, bound to the unchanged raw record.

Classification and rights are asserted persisted before each upload, with no object yet present. PA/PC/PB have separate IDs and exact object keys, literal PNG inputs, literal sanitized WebP outputs and hashes. Rights end `2026-12-01T00:00:00Z`; no TTL is invented. Offline asset validation confirmed PA red 95→72 bytes, PC green 93→72 and PB blue 94→70 against all literal expected bytes/hashes. The test does not compute expected identity/proof hashes using production algorithms.

Before issuance, comparison must show original EA plus explicit EC descendant, full old/new identifiers and explanation, PC support, generation 2 and EC's hash as correction head. B keeps EB and its own raw pin/generation 1. All three retained rights and exact comparative-download byte bodies are checked. A's commissioner and staff readbacks, immutable report/snapshot/hash/pins/date/mileage, original raw history and three pending PDF intent rows are retained separately and asserted unchanged. B must still have no report.

Only after that setup gate does R issue `comparative_attestation` using the existing strict request, A report version 3, B order version 7, both immutable raw IDs, T, rationale and complete `[PA, PC, PB]` union. Required outcome is **201 with exactly `{ proofId }`**. Neither 403 nor any setup/schema/capture/release failure is an accepted expected outcome.

After future GREEN, assertions require exact restricted proof method/content, persisted original evidence pins, A version 8/generation 2, complete EA/EC/EB and PA/PC/PB bindings, one issuance audit and no B report. Commissioner and outsider comparison/proof/provenance requests must receive generic private/no-store 403. T consumes once into B's fresh empty version-0 draft, with B's own template/date/mileage, no copied findings/evidence/PDF. Exact retry must leave proof and audits unchanged. A's immutable report, snapshot, raw pin/history, EA/EC chain and PDF rows, plus B's own raw and structured facts, survive unchanged.

## Registered teardown

Read-only prerequisite collision checks preserve a previous attempt rather than cleaning it at startup. Client IDs, request keys, finding IDs, assignment tuples and compound StaffGrant userId/capability keys are registered before writes. Server-issued order/template/raw/proof IDs are captured before dependent assertions. Finalize's server-generated PDF intent IDs and exact keys are captured after its response, before checking its status.

Before object or cascading database deletion, teardown refuses unregistered proof/report/PDF/raw/provenance/evidence descendants, correction descendants, report evidence, assignments and center children. It uses only registered exact keys for DELETE followed by HEAD 404; no bucket/prefix listing or sweep. Object errors aggregate and prevent database cleanup. Registered reports and structured evidence delete in reverse creation order, followed by registered raw/provenance and prerequisite rows. Session and User deletion requires empty descendants. Unknown state is preserved on refusal. App/object cleanup and real-clock restoration run in finally. No startup/global cleanup, worker cleanup or account purge is added.

## Offline verification

All commands ran in this writer's checkout. No local repository e2e body, service, Docker or hosted runtime was executed.

- `git switch -c agent/issue-914-manual-correction-http-red-20261022 d072e812a71e2752dd6ca3b583e76d65f4cec501` and `git push -u origin agent/issue-914-manual-correction-http-red-20261022`: PASS before edits.
- `pnpm install --frozen-lockfile --offline`: PASS, remaining 998 packages reused, zero downloads. The first filtered API command had installed only its dependency scope; full workspace linking fixed the missing admin Next dependency without tracked changes.
- `pnpm --filter @auto-tm/contracts build`: PASS, direct fresh build.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: PASS, direct generation/compilation only.
- `pnpm --filter @auto-tm/api typecheck`: PASS, direct configured TypeScript 7, final log `/tmp/issue914-c1-typecheck-final.log`.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: PASS, direct TypeScript 6, `/tmp/issue914-c1-ts6.log`.
- `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticSupportedManualCorrection.e2e.spec.ts --max-warnings 0`: PASS, direct focused lint, `/tmp/issue914-c1-lint.log`.
- `pnpm --filter @auto-tm/api build`: PASS, direct Nest build, `/tmp/issue914-c1-build.log`.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue914-c1-collection.mts --staticParse=false --json > /tmp/issue914-c1-collection.json`: PASS, actual import-based collection of **104 cases: 1 C1 + 99 comparative + 2 mixed + 1 automatic + 1 consumed-erasure**. Temporary config names only those five specs, roots this checkout's API, and sets `globalSetup: []`, `setupFiles: []`. No hooks or bodies executed.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm test:unit > /tmp/issue914-c1-unit-verified.log 2>&1`: PASS, 10 tasks successful, 9 cached; API fresh, 261 files, 2,436 passed and 2 existing skips. E2E bodies excluded. Initial run failed five AdminApiBridge cases on missing `next/navigation`; full offline workspace install resolved it. This was environment setup, never criterion RED.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm typecheck > /tmp/issue914-c1-root-typecheck-verified.log 2>&1`: PASS, 11 tasks successful, 10 cached; API task fresh. URL is inert generation configuration, not a service connection.
- `pnpm check:runtime-imports`: PASS, db/contracts.
- `pnpm test:agent-docs`: PASS, link/policy checks and 8 tests; rerun after this evidence note.
- `pnpm check:glossary` and `pnpm test:glossary`: PASS, 31 terms and 40 tests.
- `python3 /tmp/issue914-c1-preservation.py`: PASS, full tracked-byte comparison and actual collection counts, `/tmp/issue914-c1-preservation.json`.
- `git diff --check` and staged two-file scope inspection: PASS.

All **4,131** base tracked files are byte-identical. All **195** protected paths matching `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` are unchanged. Sorted `path SHA256\n` protected manifest hash is `b7df2ef47c2bc74de2ed53431dfae073fe13832f6b69475beaeec48e1905f003`.

Sibling SHA-256 values remain:

- Comparative, 93,759 bytes, 99 cases: `661fe7c95570abf057ce537db0b2c7557fc2a8982c77d6605603b90b5f237ada`.
- Mixed, 31,009 bytes, 2 cases: `887c04da348683819c49598b1b2bd4b67ebe3bb56addcf78f948dcb1534bdb5a`.
- Automatic, 22,337 bytes, 1 case: `3dded313c56a8507d3af07bfc90d84471c7ed3079cc83df2af8899f17fbdc472`.
- Consumed erasure, 38,939 bytes, 1 case: `a01c8d2c06bbb609d664037cfaa64cf49149d12a03b7600e2c6d9c287d66c201`.

The exact diff adds only the new spec and this evidence note. Existing helpers, hooks, source, contracts, schema, migrations, configuration, CI, reset, guards, budgets and siblings remain unchanged. No implementation fact or ownership changed, so the diagnostics overview needs no edit. Docs: not applicable to dependencies; internal fixture patterns reused without changing external dependencies or services.

| Acceptance evidence | Result |
|---|---|
| One C1 positive collected; compilers/lint/build/unit/typecheck/docs/runtime/glossary gates | PASS offline |
| Base/protected/sibling byte preservation and two-file scope | PASS |
| HTTP setup and reached issuance RED; future proof/consumption GREEN | UNKNOWN / UNREACHED, Root owns hosted execution |

Runtime is **UNKNOWN / UNREACHED**. No Railway calls, quota probes, credential discovery, account-wide bypass or retry of the three terminal refusals occurred. No CI dispatch/rerun/poll, reset, deployment, merge, promotion or store action occurred. Root owns publication, reached-RED classification, source assignment and final integration acceptance. Stop after this pushed checkpoint; preserve this worktree.
