# Classified identity evidence source checkpoint

Source slice #914 within #897, sole integration PR #904. Base `fc081f79875c435a4491414acf5d5372dac1e50c`; reservation `agent/issue-914-classified-identity-evidence-source-20261021` was pushed at the base before edits. Implements the [capture contract](diagnostic-identity-evidence-capture-contract-20261021.md) under [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) and ADR-0104. Source checkpoint `988f5ceb`.

## Changes

- Contracts: strict rights (`vehicle_observation`, `use: ["service"]`, `until` schedule, `hold: null`), provenance stage/staged/verified, identifier capture with optional correction, evidence record and comparison wrapper `{observation, evidence, corrections, evidenceGeneration, correctionHeadHash}`.
- Migration `20261021130000_diagnostic_identity_evidence` (forward-only, no backfill):
  - tables `diagnostic_identity_provenance` and `diagnostic_identity_evidence`;
  - `inspection_orders.identityEvidenceGeneration` (monotonic trigger);
  - report `identityEvidenceId/Hash` pin (pair CHECK, pin trigger selects the current leaf, and corrections inherit it);
  - one root per raw record and a unique `supersedesId`;
  - an owner-disjoint trigger shared with `diagnostic_evidence`;
  - immutability guards that allow only erasure or staff detachment.
- API `PrismaDiagnosticIdentityEvidence` (narrow owner):
  - stage, then upload (sanitizer, DiagnosticObjects, write lease/epoch, exact readback), then read with reauthorization after I/O;
  - append/correct with retry recognition, stale/rights/provenance fences and content-free audit;
  - list visible to current order staff only.
- Comparison: side A uses the report pin, side B the current leaf. A provenance download (`reinspection-comparison/provenance/:id`) is limited to the compared set and rechecks authority on both orders.
- Worker:
  - account erasure fences provenance and clears evidence content and report pins before intake erasure, bumps generation, and detaches deleted staff without touching others' material;
  - artifact cleanup erases expired-rights evidence, fences expired, stale-staged and unattached provenance, and deletes exact objects.
- Tests: the oracle `DiagnosticIdentityEvidence.e2e.spec.ts` is byte-unchanged. The binding and erasure comparison expectations are wrapped mechanically with every assertion kept. The erasure purge subprocess now runs from `apps/worker` with `TSX_TSCONFIG_PATH` and `tsx/cjs`, as in CampaignFullV3; its guards and purge assertions are unchanged.
- Reset manifest, reviewed schema profile, retained SQL and `scripts/diagnostic-identity-evidence-schema.test.mjs`.

## Evidence (offline)

All logs are under `/tmp/issue-914-evsrc-*.log` and use the inert `DATABASE_URL` with no connection.

| Check | Result |
|---|---|
| contracts and db build | PASS |
| TS7 typecheck (api, worker, db, contracts) | PASS |
| lint (TS6) | PASS |
| nest build | PASS |
| API unit | 2416 pass, 2 skipped |
| worker unit | 292 pass |
| `node --test 'scripts/*.test.mjs'` | 578 pass, 0 fail |
| `check:runtime-imports` | PASS |
| `git diff --check` | PASS |

NOT RUN: any HTTP or database suite, Docker, services or CI. Trigger and HTTP behavior against PostgreSQL is unproven until a hosted run.

## Limits and missing coverage

- Hosted GREEN is required for the oracle, binding and erasure suites, including the repaired purge subprocess.
- Missing structured purge tests:
  - account erasure with captured evidence, corrections and provenance: content cleared, pins cleared, generation bumped, objects queued;
  - staff detachment preserving other people's evidence;
  - foreign-order survival.
- Missing held-upload tests:
  - concurrent upload under a live write lease (BUSY);
  - an erasure or expiry fence racing an in-flight write, where a late verify must fail and queue exact cleanup.
- Missing worker tests for `retireIdentity`:
  - expired-rights evidence erasure;
  - stale staged and verified-unattached provenance after 24h;
  - exact object deletion and retry accounting.
- After expiry erasure, a report keeps its pin id and hash while the content is gone. Comparison then denies.
- The normalized VIN is not persisted separately.
- `objectKey`/`sha256` are kept after erasure solely for exact cleanup.
- Out of scope and unchanged: proof issuance, consumption and transfer; real collection, which stays closed; hold powers; v3 historical preservation; and reset executor/Redis.
