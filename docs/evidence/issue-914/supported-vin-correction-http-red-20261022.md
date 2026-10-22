# Supported VIN recording correction HTTP checkpoint, 2026-10-22

This is the bounded C2 test-only checkpoint for #914 within founder-selected #897–#920. Root is sole assembler through integration PR #904. Policy is [approved ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md); the controlling contextual plan is `/tmp/issue-914-mixed-corrected-next-red-plan-20261022.md`, section C2 only. C1, M1 and M2 are unchanged. No source or additional agent work occurred. Runtime is **UNKNOWN / UNREACHED**, including C1. This note records offline preparation, not an observed criterion RED.

Branch `agent/issue-914-vin-correction-http-red-20261022` was created and pushed before edits from exact supplied base `c4df4ad7116058b39e1b631c161bb79f1a241f86`, tree `aeb229c99bd8434978d0044c061937d7faeef314`. The T3-created worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-1b453d93`; its original scaffold branch `t3/1b453d93` remains at that base. Preserve this worktree. The checkpoint adds only this note and [DiagnosticSupportedVinCorrection.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticSupportedVinCorrection.e2e.spec.ts). No PR was created.

## Journey and setup gate

One independently collected positive C2 journey uses real Nest/DiagnosticsModule, Fastify on a loopback ephemeral port, current JWT/Session admission, Prisma, Redis and private S3 adapters. Only synthetic actors, Sessions, compound StaffGrants, center and current qualifications are seeded. Template publication, both visits, assignments, authorization, appointments, observations, provenance staging/upload, structured evidence, report release, proof issuance and consumption go through owning HTTP. Database reads inspect facts without an HTTP representation, persisted bindings and immutable storage. No diagnostic report, proof, raw record, pin, evidence, provenance or correction is seeded or patched.

A/B have the same nonnull private commissioner and no Listing. They are distinct visits with fresh physical authorization, confirmed/arrived appointments, T and an independent currently qualified R assigned to both. R differs from T, and T links B. The fixed clock is `2026-10-21T12:00:00Z`. A observes 10:00/123000, method VIN, `SYN-VIN-04I`, null manualReference. Its raw record is version 6. EA at version 7 retains PA and records both original VIN04I and independently useful consistent `chassis_stamp=SYN-CHASSIS-041`. A releases through draft, finding, submit and independent finalize to report version 3. B independently observes 11:00/123100, VIN041 and null manualReference, raw version 6, then captures its VIN041/chassis041 with independent PB at version 7.

A is reobserved through ordinary `/vehicle` with expectedVersion 7, retaining date/mileage and correcting VIN to `SYN-VIN-041`. The test immediately reads/registers raw history before checking either response status. It requires the original raw6 unchanged plus a distinct immutable corrected raw8. New PC is staged/uploaded at A8 before appending EC bound to raw8 and explicitly superseding EA, with VIN041/chassis041 and a nonempty I/1 recording-error explanation. Literal EC version 9 and generation 2 follow the existing intake/evidence adapters: each observation appends a raw record and increments order version; each structured append increments order version and generation; release changes report version without changing order version. No report correction or pin retargeting occurs.

PA/PC/PB use separate registered IDs and exact keys. Rights are declared and asserted persisted before bytes, ending `2026-12-01T00:00:00Z`, with no invented TTL. The literal red/green/blue PNG inputs, sanitized WebP outputs, sizes and SHA-256 values are copied byte-for-byte from C1 and unchanged. A's original report/raw/evidence pin, snapshot/hash/date/mileage, commissioner representation, staff representation and three pending PDF intents are retained separately. Before issuance the comparison must expose original raw6/EA/VIN04I plus explicit EC/raw8/VIN041, explanation and PC support, generation 2 and EC's correction-head hash. B retains its own current raw/capture pin. R downloads exact sanitized bytes for all PA/PC/PB and the test checks retained rights. Both raw histories and A's immutable storage/readbacks must be intact; B has no report. Every setup assertion must pass before criterion evaluation.

R then POSTs the existing strict `comparative_attestation` request with A report version 3, B order version 7, **original A raw6 ID**, B raw6 ID, T, rationale and complete `[PA, PC, PB]` provenance union. Required outcome is **201 with exactly `{ proofId }`**. A corrected original mismatch never selects `automatic_normalized_vin`. Current manual-only comparative admission and flattened conflicting claims predict 403; source inspection does not establish RED. Only Root's actual reached hosted issuance outcome can classify it. Setup/schema/capture/comparison failures do not count as criterion RED.

After future GREEN, assertions require exact restricted proof method/readback, original A report/raw/evidence pin, A order version 9/generation 2, complete EA/EC/EB and PA/PC/PB bindings, one issuance audit and no B report. Buyer and outsider comparisons/proof/provenance requests receive generic private/no-store 403. T consumes once into B's fresh empty version-0 draft with B's own date/mileage/template, no copied findings/evidence/PDF. Exact retry leaves persisted proof and audits unchanged. A's original storage/report/pins/raw6 plus appended raw8/EC chain and PDF intents, and B's own facts, remain unchanged.

## Registered teardown

C1's exact registered teardown pattern is reused within a fresh namespace. Read-only collision checks preserve prior attempts. Client request keys, IDs, findings, assignment tuples, compound StaffGrant keys and exact object keys are registered before writes; server-issued IDs before dependent assertions. PDF intent IDs/keys are captured immediately after finalize before checking status. Raw history is captured following each `/vehicle` even if its status fails.

Before object or cascading row deletion, teardown refuses unregistered report/proof/PDF/raw/evidence/provenance/correction descendants, report evidence, assignments and center children. Only registered exact keys receive DELETE then HEAD 404. No bucket/prefix listing, startup/global cleanup, worker cleanup or account purge exists. Reports and evidence delete in reverse creation order with descendants protected. Session/User deletion requires empty descendants; failures aggregate and preserve unknown state. Finally closes app/S3 and restores the real clock.

## Offline verification

All commands ran in this writer's checkout. No Docker, services, e2e hooks/bodies or hosted runtime were executed.

- `git switch -c agent/issue-914-vin-correction-http-red-20261022 c4df4ad7116058b39e1b631c161bb79f1a241f86` and `git push -u origin agent/issue-914-vin-correction-http-red-20261022`: PASS before edits.
- `pnpm install --frozen-lockfile --offline`: PASS, 2,034 packages linked from local store, zero downloads. Log `/tmp/issue914-c2-install.log`.
- `pnpm --filter @auto-tm/contracts build`: PASS, direct fresh build, `/tmp/issue914-c2-contracts.log`.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: PASS, direct generation/compilation only, `/tmp/issue914-c2-db.log`.
- `pnpm --filter @auto-tm/api typecheck`: PASS, direct configured TypeScript 7, `/tmp/issue914-c2-typecheck.log`.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: PASS, direct TypeScript 6, `/tmp/issue914-c2-ts6.log`.
- `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticSupportedVinCorrection.e2e.spec.ts --max-warnings 0`: PASS, direct focused lint, `/tmp/issue914-c2-lint.log`.
- `pnpm --filter @auto-tm/api build`: PASS, direct Nest build, `/tmp/issue914-c2-build.log`.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue914-c2-collection.mts --staticParse=false --json > /tmp/issue914-c2-collection.json`: PASS, actual import-based collection of **105 cases = 99 comparative + 2 mixed + automatic + consumed erasure + C1 + C2**. Temporary config includes only those six specs with `globalSetup: []`, `setupFiles: []`; no hooks/bodies/services. Initial temporary-config preparation guessed a nonexistent mixed filename and stopped at its local assertion; corrected to the existing `DiagnosticComparativeIdentityModes.e2e.spec.ts` before successful collection. No repository configuration changed.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm test:unit`: PASS, 10 successful tasks, 9 cached; API fresh with 261 files, 2,437 passed and 2 existing skips. Log `/tmp/issue914-c2-unit.log`. E2E bodies excluded.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm typecheck`: PASS, 11 successful tasks, 10 cached; API fresh. Log `/tmp/issue914-c2-root-typecheck.log`. The inert URL configures generation and does not connect to a service.
- `pnpm check:runtime-imports`: PASS, db/contracts, `/tmp/issue914-c2-runtime.log`.
- `pnpm check:glossary` and `pnpm test:glossary`: PASS, 31 terms and 40 tests, `/tmp/issue914-c2-glossary.log` and `/tmp/issue914-c2-glossary-tests.log`.
- `pnpm test:agent-docs`: PASS after this note, `/tmp/issue914-c2-docs.log`.
- `python3 /tmp/issue914-c2-preservation.py`: PASS, full base tracked-byte comparison, protected manifest, sibling hashes and actual collection counts, `/tmp/issue914-c2-preservation.json`.
- `git diff --check` and staged exact two-addition scope inspection: PASS.

No implementation fact or ownership changed; diagnostics overview, glossary and runtime boundaries need no edit. Docs: not applicable, internal fixture reuse without external dependency or service changes.

All **4,134** base tracked files are byte-identical. All **195** protected paths matching `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` are unchanged. The sorted `path SHA256\n` protected manifest hash is `b7df2ef47c2bc74de2ed53431dfae073fe13832f6b69475beaeec48e1905f003`. Sibling byte sizes, actual collected cases and SHA-256 values remain:

- `DiagnosticAutomaticVinProof.e2e.spec.ts`: 22,337 bytes, 1 cases, `3dded313c56a8507d3af07bfc90d84471c7ed3079cc83df2af8899f17fbdc472`.
- `DiagnosticComparativeIdentityModes.e2e.spec.ts`: 31,009 bytes, 2 cases, `887c04da348683819c49598b1b2bd4b67ebe3bb56addcf78f948dcb1534bdb5a`.
- `DiagnosticConsumedPrivateLinkErasure.e2e.spec.ts`: 38,939 bytes, 1 cases, `a01c8d2c06bbb609d664037cfaa64cf49149d12a03b7600e2c6d9c287d66c201`.
- `DiagnosticContinuityProofIssuance.e2e.spec.ts`: 93,759 bytes, 99 cases, `661fe7c95570abf057ce537db0b2c7557fc2a8982c77d6605603b90b5f237ada`.
- `DiagnosticSupportedManualCorrection.e2e.spec.ts`: 38,800 bytes, 1 cases, `58fcd5153e560f385a02e2a774eabd9e2b9915459c15b5b48fe7162cc6a7465e`.

Offline collection, compilers, lint/build, repository unit/typecheck, docs/runtime/glossary and preservation gates pass. HTTP setup, reached issuance RED and future proof/consumption GREEN remain **UNKNOWN / UNREACHED**. Root owns hosted classification, any source work, publication and independent final integration review.

No Railway calls, quota probes, credential discovery or account-wide bypass occurred; the three prior scoped refusals remain terminal. No CI dispatch/rerun/poll, reset, deployment, merge, promotion or store action occurred. Stop after the pushed checkpoint, preserving this worktree.
