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

## Final local receipt

- Reservation: base `fea9350155c20533a15dbcd2d4c9ac331b23d619`, branch pushed before edits.
- Import-only collection: `pnpm --filter @auto-tm/api exec vitest list --config /tmp/public-auto-181545-collection.config.mts --staticParse=false --json` returned 20 imported cases, including the two new cases. No setup/global hooks or bodies ran. Hosted HTTP/PostgreSQL result remains UNKNOWN.
- `DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:1/not_connected pnpm --filter @auto-tm/db build`: pass. Contracts build, API TS7 typecheck, API TS6 typecheck, API lint, API build, runtime-import check, and root typecheck: pass. Root typecheck used 10 cache hits and executed the changed API task. Root unit test used 9 cache hits and executed the API unit task: 10 tasks passed, API 267 files / 2552 tests passed with 2 skipped.
- Initial API TS7/runtime checks before package builds were blocked by absent `@auto-tm/db` and `@auto-tm/contracts` dist outputs. The initial DB build also correctly refused a missing `DATABASE_URL`; no service connection was attempted.
- Root docs and glossary checks: pass. `git diff --check`: pass.
- Final source SHA256: see the Root handoff manifest; final commit/tree are recorded below.

This test slice intentionally leaves the current automatic public gate RED. It does not add a public ownership column, epoch, actor, DTO, migration, issuer power, or policy decision.

Final candidate after the disclosure assertions: commit `e4e03f053a16f782ab4ff7402e453364868e5f6d`, tree `9d8c38d6f3ca551a925587bab909993567e3a3a1`. Final source SHA256 is recomputed at handoff. The broader continuity import collection returned 135 cases, including 20 public cases, with setup/hooks disabled; the focused file collection returned 20.
