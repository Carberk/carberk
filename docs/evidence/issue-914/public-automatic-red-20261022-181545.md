# Issue 914 public automatic VIN test handoff

Base: `fea9350155c20533a15dbcd2d4c9ac331b23d619`  
Branch: `agent/issue-914-public-auto-red-20261022-181545`

This test-only slice extends `DiagnosticPublicTransferProof.e2e.spec.ts` with two real HTTP/PostgreSQL cases. Existing public and private case bodies are preserved.

The positive case builds two ordinary public visits with separate seller consent, physical authorization, reviewer assignment and technician assignment. It retains one VIN/chassis evidence root per visit, verifies A release immutability, issues `automatic_normalized_vin`, consumes the proof with an exact retry, creates an independent B draft, submits and finalizes B with a new finding, checks the public report/listing, and proves that A evidence is not copied or disclosed. The current source gate in `ContinuityPair` and the public SQL predicate intentionally refuse this method, so the hosted positive body is expected to be RED until the approved unchanged-ownership contract is implemented.

The negative case mutates B's Listing seller, restores the exact original row, then performs a fresh authorized B observation with new own evidence. It asserts current Listing equality and association are not enough to issue automatic continuity, with no proof or report seeded. The first refusal is the tested oracle; later consume/finalize steps are not claimed because issuance is the earliest source refusal.

## Verification

- `git diff --check`: pass.
- No local services, Docker, reset, deployment, credentials, or destructive suites were run.
- Actual HTTP/PostgreSQL bodies: hosted `UNKNOWN` from this writer; Root owns hosted execution.
- Import-only collection must be run by Root with `--staticParse=false`, no setup/global hooks/bodies. The two added cases should increase this file's imported case count by two; execution remains `UNKNOWN` until hosted.
- No production, schema, migration, reset, CI, or runtime-boundary files changed.

## Source blocker

`continuityPair` admits public pairs only for `comparative_attestation`. `PrismaDiagnosticContinuityProofs` and the migration SQL retain that public method gate. The current order stores mutable Listing digest/association state but does not retain an immutable ownership-at-visit fact in the identity record or released public snapshot. Allowing automatic by comparing current Listing equality would fabricate historical continuity after seller/identity mutation and restoration. This slice records that blocker without changing policy or schema.
