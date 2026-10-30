# Issue 914 automatic normalized-VIN HTTP test checkpoint

Bounded TEST-ONLY writer for selected #897, sole integration PR [#904](https://github.com/Carberk/carberk/pull/904). Parent local base `f793bbdd47d3152d2283863aeaa49b7708931420`, tree `2556de0cf245b7c040143e0faf14a60900cc0f64`. This includes published diagnostic `f31f4e828ad6ff8d80ed35253e791ca005e57dff`, the holder IPC commits and the private consumption atomicity append. No hosted result is attributed to this base or candidate by this writer.

Reused host-created isolated worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-d11b5916`. Scaffold `t3/d11b5916` remains at the base. Reserved and pushed unique branch `agent/issue-914-automatic-vin-http-red-20261022-d11b5916` at the base before writing. Only the new automatic spec and this evidence file belong to the checkpoint.

## Acceptance boundary

The source-informed design `/tmp/issue-914-automatic-vin-next-red-design-20261022.md`, [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md), [original option 1](../issue-897/diagnostic-reinspection-continuity-transfer-decision-table-20261021.md) and [founder approval handoff](../issue-897/diagnostic-continuity-approved-implementation-20261021.md) govern. Root explicitly bounds the positive issuer to the existing distinct qualified reviewer, independently assigned to both visits. B's linking technician is distinct and currently assigned. Broader automatic actor eligibility remains unresolved and excluded. No technician, self or background issuer authority is proposed.

[DiagnosticAutomaticVinProof.e2e.spec.ts](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticAutomaticVinProof.e2e.spec.ts) adds one positive case with real Nest/Fastify HTTP, JWT/current identity authority, Prisma, Redis and private S3 composition. Only established catalog, center, staff grants, qualifications, Users and Sessions are seeded. Orders, assignments, physical authorization, appointments, observed identities, classified provenance intent/upload, structured identity capture, report creation/review/release, comparison, proof issuance/read and consumption all use ordinary HTTP. No proof, report, evidence or identity-pin rows are seeded. Existing runtime/clock boundary overrides preserve synthetic admission and deterministic dates, with real timers active.

A and B have the same private commissioner and no Listing. A submits `"  syn-vin-041  "` and retains `"syn-vin-041"`; B retains `"SYN-VIN-041"`. Their dates, mileages, raw identity ids and independent red/blue provenance differ. Both capture consistent `vin_stamp` evidence. Literal synthetic PNG/WebP bytes, sizes and hashes establish upload/download expectations. Proof bindings retain server-issued ids/hashes; the client computes no proof authority hash.

The setup boundary requires both visits' successful capture at order version 7, A's ordinary finalized release at report version 3, exact comparison of pinned A and B's own identities/evidence, generation 1 and empty corrections, an empty B report list, and both restricted provenance byte downloads. Only after these assertions does the test POST `automatic_normalized_vin`, the full retained provenance references and rationale to the existing strict `/orders/:B/continuity-proofs` route.

The positive remains **expected 201**. The assertion includes the actual response body in its failure message. Current contracts admit only `comparative_attestation`; source predicts first actual failure **400 `DIAGNOSTIC_INVALID_INPUT` at the method schema**. This is a prediction, not executed RED. A setup failure, another reached result or an unexpected success must be preserved and classified from hosted evidence. No source, schema, contracts, migration, guard or configuration change makes this pass.

After future successful issuance, the test requires exact restricted proof readback, `automatic_normalized_vin`, `same_vehicle`, actual reviewer/time and exact retained bindings. The commissioner cannot read the proof. Issuance leaves B report-free and A unchanged. Ordinary technician consumption must return 201 with B's own date, mileage and pinned template, empty findings, no documents and an independent draft linked to A. A's released representation remains exactly unchanged. Nothing copies A findings or identity evidence into B.

The optional refusal matrix is deferred because this writer has no executed proof that the automatic fixture reaches issuance. Existing 96 cases retain private manual lifecycle, authority, atomicity, unsupported public/mixed audience and strict invalid-syntax coverage. New unequal/contradictory VIN, manual/VIN directions, missing material, commissioner and automatic authority refusals remain future acceptance work. Public transfers and unchanged public automatic issuance are excluded from this first slice.

| Criterion | Evidence | Result |
|---|---|---|
| One separately collected automatic case; existing cases preserved | Offline Vitest expanded collection and byte comparison | PASS, 1 new plus 96 original |
| Compiler, lint and offline regression gates | Commands below | PASS after dependency hydration |
| Real capture/release/comparison setup | Assertions before marked setup boundary | UNREACHED locally; hosted execution required |
| Eligible automatic proof issuance/read and empty B consumption | Positive HTTP assertions remain 201 | UNREACHED; no runtime RED/GREEN claimed |

## Preservation

Original `DiagnosticContinuityProofIssuance.e2e.spec.ts` is byte-identical to base: 85,443 bytes, SHA-256 `65c5dc920efeb070b9f99bf045536fd861916f8ade198f0c09ac9b62c9aa9daf`. Its expanded 96 names retain order; compact UTF-8 JSON name-array SHA-256 `623190442dbd35f119a53a9a66b1e9c997006fc6a29b58abdfab055faa33944e`.

All 193 base tracked paths matching `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` are byte-identical. Their sorted `path SHA256\n` manifest SHA-256 is `ba5f060d938aed5df5163b4d12e10948e088ab88ed364752c076d88647d5e410`. Every existing tracked path is unchanged; the final diff adds only the new spec and this note. Other suites, existing helpers/setup/teardown, production, schema, contracts, migrations, CI and configuration remain unchanged.

## Exact offline commands and results

- `git rev-parse f793bbdd` and `git rev-parse 'f793bbdd^{tree}'`: resolved base/tree above. Inspected worktrees, branches, remote reservation prefix and clean status before reserving the unique branch.
- `git switch -c agent/issue-914-automatic-vin-http-red-20261022-d11b5916` then `git push -u origin agent/issue-914-automatic-vin-http-red-20261022-d11b5916`: PASS, reservation at base.
- `pnpm --filter @auto-tm/contracts build`: PASS.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: PASS. Offline placeholder used for generation only, no DB connection.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue914-automatic-vitest-collection.mts --staticParse=false --json`: PASS, 97 expanded cases. The temporary config exports only `{ test: { globals: true, setupFiles: [], globalSetup: [], include: [absoluteNewSpecPath, absoluteOriginalSpecPath] } }`. Collection runs no hooks, global setup or setup files, and starts no external services. JSON saved at `/tmp/issue914-auto-collection.json`.
- `pnpm --filter @auto-tm/api typecheck`: PASS, TypeScript 7.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: PASS, TypeScript 6.
- `pnpm --filter @auto-tm/api lint`: PASS.
- `pnpm --filter @auto-tm/api build`: PASS.
- `pnpm test:unit`: first run failed five existing `AdminApiBridge.spec.ts` cases with `Cannot find package 'next/navigation'` from admin's API client. Remaining API result was 260 passed files, 2,421 passed tests and two skipped tests. No product repair was made.
- `pnpm --filter @auto-tm/admin exec node -p 'require.resolve("next/navigation")'`: PASS, hydrated configured admin dependencies from the existing store. No manifest or lockfile change.
- `pnpm test:unit`: retry PASS, all 10 tasks successful, 9 cached. Fresh API result was 261 passed files, 2,426 passed tests and two existing skips. This excludes all e2e specs and supplies no new automatic runtime evidence.
- `pnpm typecheck`: PASS, 11 tasks successful, 10 cached.
- `pnpm check:runtime-imports`: PASS, db/contracts.
- `pnpm test:agent-docs`: PASS, eight tests. Rerun after writing this note.
- `pnpm check:glossary`: PASS, 31 terms. `pnpm test:glossary`: PASS, 40 tests.
- `python3 /tmp/issue914-auto-preservation.py`: PASS. It compares each protected path and the complete original spec with `git show <base>:<path>`, checks expanded collection counts and records byte/name/manifest hashes at `/tmp/issue914-auto-preservation.json`.
- `git diff --check`: PASS. Final staged path review must contain only the two additions above.

Preparation notes: the first scratch writer invocation used unavailable `python`; `python3` succeeded. pnpm hydrated configured dependencies in this owned checkout. No tracked setup or dependency changes were required.

Docs: not applicable, internal acceptance coverage reuses established Nest/Prisma/Vitest/storage patterns without external dependency changes. Diagnostics ownership and implementation facts remain unchanged, so its overview needs no update.

This is a pushed test checkpoint, not final independent review, hosted acceptance or runtime RED. Root alone publishes and classifies hosted evidence before authorizing source GREEN. No local Docker/external services, Railway, credential search, alternate access scope, deployment, reset, CI dispatch/mutation, merge, promotion, submission or additional agents. The prior three Railway refusals remain terminal and were not retried. No new PR or GitHub content comment was created; PR #904 was linked to this thread.
