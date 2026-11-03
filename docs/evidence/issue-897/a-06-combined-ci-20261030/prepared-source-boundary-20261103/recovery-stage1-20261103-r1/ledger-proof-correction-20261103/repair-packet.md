# Ledger and proof-detail bounded correction (issue #938)

Contract: https://github.com/Carberk/carberk/issues/938#issuecomment-6593883585. Offline slot: 2026-11-03 02:25–03:10 UTC. Addresses Spec review findings 2 and 3 (receipt sha256 `fd56a28d…`).

- Candidate base: `dfb84ee85d8e064af41c3fb55efd1ca84edc313b` (tree `2172c853c3265ceb1fe21ee1bb0c27aae3867e7f`). Prior clean handoff: `163af4b293d3fac47385069d09eb85d3ad3e7dae`.
- Source checkpoint: `94ad0134a5d5ec03beb70a69746054637f0e937b` (tree `d12ade3deddcb50fcd6a8ab1312d5ddd2a4ae0c6`).
- Changed source paths, all within the contract allow-list: the helper plus three e2e files: Handoff, Capture, Readers. `DiagnosticScopedDiscovery.e2e.spec.ts` is unchanged.
- The completion-tracking block in `withPreparedReaderFixture` is byte-identical to the candidate's.

## Change

- Helper (`diagnosticPreparedReaderFixture.ts`), production event order unchanged:
  - Buyer-private orders now check that no ownership grant exists, then record `no ownership grant` at 5 from a persisted order read.
  - `first observation` is renamed `first raw`.
  - After provenance stage and upload: `provenance stage-upload` at 6 (public 7), from a persisted read.
  - After proof issue: `proof issue-read` at 7 (public 8), from a persisted read.
  - All versions are per-audience literals. `record` still fails on any version mismatch.
- Handoff:
  - Right after issue, the reviewer `GET orders/:b/continuity-proofs/:proofId` must return literal HTTP 200.
  - Private B ledger is asserted with `toEqual` against literal entries: create0 / physical authorization1 / reviewer assignment2 / technician assignment3 / confirmed4 / arrived5 / no ownership grant5 / first raw6 / provenance stage-upload6 / retained evidence append7 / proof issue-read7.
  - Retained: persisted B version 7 and proof pin 7, full DTO, HTTP 200, `no-store, private`, technician proof-detail 403, reviewer and foreign handoff 403, real foreign reassignment, exact scoped-empty DTO.
- Capture asserts its separate public ledger literal: create0 / physical1 / publication2 / reviewer3 / technician4 / confirmed5 / arrived6 / grant before first raw6 / first raw7.
- Readers asserts the separate public B ledger literal right after issue: …6 / grant6 / first raw7 / provenance stage-upload7 / evidence append8 / proof issue-read8.
- No grants were added to buyer-private B. No normalization, computed expectations, loose matchers, backdating or reset. No route, guard, production, SQL, config or memory-database change.

## Verification

- Offline checks ran one at a time on the committed source checkpoint, and each exited 0: API typecheck, tsc6 `--noEmit`, lint, build, `git diff --check`. Exact argv, timing and raw hashes are in `offline-command-receipts.json`. There were no setup failures.
- The original nine suites and `DiagnosticMemoryDatabase.ts` match their recorded hashes and their blobs at `87456f4f`. All 40 prior evidence files are byte-identical to the prior handoff. The line-level assertion map is in `final-source-audit.json`.
- Lineage note: the base-to-source documentation differences are coordinator-lineage files absent from the writer branch, not writer edits. Outside `docs/`, the base-to-source differences are exactly the four allowed paths.

## Open, not claimed

- The Redis DB1 flush/zero, Compose resolved-config hash and failed-setup fallback in `globalSetup` (Spec review finding 4) remain an open pre-runtime packet item.
- Runtime, DB, storage and services were not started and remain held. No package, hosted, native or PR action was taken.
- This is a #938 source checkpoint only. It is not a ticket, runtime, #934 or Milestone A PASS.

## File hashes (sha256)

    9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538  api-build.stderr
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-build.stdout
    960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  api-lint.stderr
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-lint.stdout
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-tsc6.stderr
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-tsc6.stdout
    8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  api-typecheck.stderr
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-typecheck.stdout
    39e5ab7fbce26a308a51218e2d2053c51cb825522970b997724955ff15f2242c  final-source-audit.json
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  git-diff-check.stderr
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  git-diff-check.stdout
    427c105598ceaddfb027e6826465084382eeb0fbee5573c60e9c70706be478e2  offline-command-receipts.json
