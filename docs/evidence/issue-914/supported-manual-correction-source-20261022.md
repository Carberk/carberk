# Supported manual recording correction source

This isolated implementation writer starts at `64dd203a5ef9090c92f3cad4a1f4b1281bd9a868`, tree `e2e4485d91813b2fe3bd7749211149c777e905ab`, on `agent/issue-914-supported-manual-correction-20261022`. Reservation was pushed before edits. Root alone assembles #914/#897 through integration PR #904. No child agents or issue PR were created.

Host catalog confirmed inherited provider `codex_work`, model `gpt-6.1-sol`, and Standard service. Catalog `reasoningEffort.currentValue` was `low`; injected runtime says medium. This discrepancy prevents independently confirming the requested medium host control. No model replacement, control mutation or quota probe occurred.

## Test-first evidence

RED `e86799a0116bbfa9ba992069465c1eecb0361cce`, tree `a29e9018a7d855ba67893d50b97666cdbc4900b1`, adds only [policy behavior tests](../../../apps/api/src/modules/diagnostics/domain/PrivateContinuityManualCorrection.spec.ts). It was committed and pushed before production edits. The existing policy spec and production source are byte-identical to the base at RED.

The exact command freshly ran before and after implementation:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts src/modules/diagnostics/domain/PrivateContinuityManualCorrection.spec.ts
```

RED reached the policy: 23 failures, 29 passes. The supported I/1 positive fails at new spec line37 with `DIAGNOSTIC_NO_ACCESS`, thrown by original policy line37 when flattened original/corrected chassis claims conflict. All 25 existing policy cases passed. GREEN passes all 52 cases, including all six record permutations with root/middle/leaf pins in both visit positions, original/middle/leaf/other-visit rights, provenance expiry, missing/disconnected/branch/cycle/duplicate links, altered pins, cross-order/nonmonotonic/raw-binding conflicts, missing explanation/fresh support, conflicting current identifiers and unsupported VIN/automatic cases. Original domain cases remain byte-identical.

Initial package-resolution/build failures were setup only. Building contracts before DB and supplying the nonconnecting generation placeholder `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` resolved them. They establish no criterion RED. The [c4 hosted receipt](../issue-897/public-transfer-assembly-and-c4-hosted-receipt-20261022.md) remains the genuine C1 HTTP RED: issuance403 versus required201 after successful capture, release, comparison and exact bytes. This writer claims no new HTTP runtime result.

## Owning boundary and retained security

[Private comparative policy](../../../apps/api/src/modules/diagnostics/domain/PrivateContinuityAttestation.ts) receives complete schema-validated evidence records and an explicit immutable pin from the [proof adapter](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts). Records retain id/order/version, raw observation binding/hash, record hash, observation, identifiers, provenance, rights and explicit supersedes/explanation. Resolution traverses explicit links from the sole root, checks complete coverage and support, and uses the complete terminal record as the justified interpretation. It never infers correction from identifier spelling, freeform rationale or array position. The full original record and pin remain unchanged.

Existing DB guards enforce same-order earlier parents, single successor, immutable content and exact raw/provenance binding. Existing evidence comparison retains and checks every ancestor/descendant. The proof adapter additionally counts all order evidence for this correction path: an unrepresented root/component cannot disappear through pin-component selection. The policy refuses disconnected, missing, branching or cyclic graphs and simultaneous contradictory current claims. A correction replaces a complete record; omitted historical fields are not silently inherited.

Only manual/manual comparative corrections use this interpretation. Uncorrected manual/manual, mixed and automatic policy paths remain unchanged. Graph records retain the observation data needed for a later VIN correction slice, but any VIN record in this manual correction chain refuses. No capture authority, precedence, fuzzy matching or OCR was added.

Full-chain evidence rights and all comparison provenance rights still determine the minimum retention. Both issuance and consumption call the same policy. Existing facts still bind the original pins, every original/correction record hash and rights hash, all provenance hashes/epochs/rights, order versions/generations, observations, physical authorizations, current issuer/session, qualification and assignments. Lock ordering, invalidation, exact retries, transactional audits/rollback, successor uniqueness, consumed-link survival and erasure code are unchanged.

The new [ordinary HTTP negative sibling](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticManualCorrectionConflict.e2e.spec.ts) declares two serial cases. Both establish real Nest/Prisma/private-S3 capture, released A with its original pin/snapshot/PDFs, explicit supported EC, independent retained B, full comparison, three literal sanitized byte downloads with exact lengths/hashes and independent current reviewer/technician authority. One leaf contains chassis041 and chassis999 simultaneously. The other has a consistent corrected leaf but advances to the original evidence/provenance expiry after a valid full comparison. Both require uniform403/private-no-store/no-secret, no proof/report/audit residue and unchanged source/release rows. The conflict case rereads comparison/bytes; expiry requires comparison/bytes refusal. Cleanup preserves request-owned registries, intake-created reception assignments, collision fences, descendant preflight, object-first exact deletion/HEAD404 and guarded parent-order cascades for immutable identities.

## Offline verification

Logs and manifests are under `/tmp/issue-914-manual-correction/`.

| Gate | Result |
|---|---|
| Exact RED/GREEN command above | Fresh RED23/29, then GREEN52/52; `red.log`, `green.log` |
| Configured root `pnpm test:unit` | PASS10/10 tasks; API fresh262 files, 2478 pass/two existing skips; nine tasks cached; `root-unit-retry.log` |
| Configured root `pnpm typecheck` | PASS11/11; API fresh, ten tasks cached; `root-typecheck.log` |
| Direct API `tsc --noEmit` / `tsc6 --noEmit` | Both fresh PASS; `ts7.log`, `ts6.log`, empty output |
| Affected ESLint / full API lint | Both fresh PASS, zero warnings; `affected-lint.log`, `full-api-lint.log` |
| API Nest build | Fresh PASS; `api-build.log` |
| Agent docs / runtime imports / glossary / diff | PASS; glossary31 terms |
| Import-only collection | 110 declarations, empty stderr; unchanged selected108 plus new2; `collection.json` |
| Base preservation | 4146 base paths inspected against git blobs/modes; only three permitted existing paths differ, other4143 identical; all98 existing E2E paths and original domain spec identical |

The first root unit run failed five existing AdminApiBridge cases because this checkout had not installed the admin workspace's `next/navigation`. `pnpm --filter @auto-tm/admin exec node -p "require.resolve('next/navigation')"` installed its locked workspace dependencies and resolved that package; the unchanged configured root unit command then passed. `root-unit.log` preserves that setup failure. No product/test/config fix or exclusion was used. Cached results are cache reuse, not fresh execution.

Collection used a temporary config with only the nine selected continuity specs, empty `globalSetup` and `setupFiles`, and `vitest list --staticParse=false --json`. Actual module imports registered the unchanged original99, mixed2, automatic1, consumed-erasure1, C1/C2/P1 one each, existing conflict2 and new negatives2. Names/files of the original108 exactly match prior collection after normalizing checkout prefixes. Hooks, test bodies and diagnostic HTTP did not run.

Preservation script `preservation.py` compares each actual base git blob and mode with current bytes, including binary/non-ASCII paths. `base-file-preservation.json` records every base/current hash and mode; `existing-e2e-preservation.json` records all98 original E2E files. No guards, contracts, schemas, CI, test budgets/timeouts, reset barriers or existing E2E assertions changed.

Docs: not applicable. This is an internal policy/adapter change using existing repository contracts and APIs; no dependency or external service interface changed. The diagnostics overview's affected correction limitation was updated. Parent execution bodies were not edited.

## Required handoff gates

Root must assemble the pushed checkpoints and run hosted real PostgreSQL/private-storage acceptance for the unchanged C1 positive, the new negatives and retained regression/security cases. Independent fixed-SHA review and all wider #897 release gates remain required. C2 VIN correction and P1 public runtime remain UNKNOWN. VIN raw corrections, comparative VIN/VIN, public transfer/temporary fallback and multiple-root automatic eligibility remain required future slices, not release exclusions.

No local Docker/database/Redis/container-backed diagnostic HTTP, Railway/deployment/reset, credential discovery, CI dispatch/rerun/cancel/poll, external message, merge/promotion/store/launch occurred. Three scoped Railway refusals remain terminal. No release acceptance is claimed.

## Artifact SHA-256

- `red.log`: `a34fcd91b23b4cd09738befcd91e77cfd7f24dfd85d7055368480eded1777747`
- `green.log`: `ec11939f0d4ea5cfa2cd4ea6123679185d6958aa57884f8377a034c5c3d2fb49`
- `root-unit-retry.log`: `2c739d4d0183c39f6b86185e857a15a65407cda238af11838c7bb31b407b3234`
- `root-typecheck.log`: `a0f6e9e41b888a5fa666b711e439041f26b1a746ad960b16610840885d4abe84`
- `base-file-preservation.json`: `8c7dc404a4b7062813a8d23cfe1e391ec2bf463ef0f2f4b03913e2dcd1503214`
- `existing-e2e-preservation.json`: `493e386d73f80e3d54c28d48441e2688a0ccb7b9d0c364dc6e686d9f531f215e`
- `collection.json`: `91c209a0b199a410dbe7f6c70fbf440d425261b80b605075b8cb89e43338f4d1`
