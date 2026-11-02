Spec verdict: **FAIL/open** on `b6dac5d17c140c8fd307a24df56d4a82ed070625`, against base `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. The separate `4feaebd` candidate was excluded.

Paths below are repository-relative.

- **P1 — implementation blocker.** `scripts/staging-schema.mjs:73` omits migrations 162, 163, 164 and `20261029190000_operational_reset_row_admission` from the current schema inventory; their checksum approvals are also absent. Validation at `:216` therefore rejects retained-schema restoration planning. Independent inventory inspection confirms the retained RED. Governing requirement: `docs/evidence/issue-897/a-wayfinder-ticket-map-20261030.md:140` requires “the isolated fixture is restored.”

- **P1 — A-02 acceptance unproved.** `apps/worker/src/jobs/diagnostics/DiagnosticWorkerOwnershipBatch.e2e.spec.ts:117` requires the absent ordinary fixture manifest. Raw retained results show **ten skipped bodies**, while preparation passed **12/12**. Capacity, ownership erasure, rollback and race convergence remain unproved. Governing requirement: `docs/evidence/issue-897/a-wayfinder-ticket-map-20261030.md:88`: “FAIL on skipped/ambiguous cases.” This establishes a setup failure, not faulty production erasure.

- **P1 — A-03 acceptance unproved.** `docs/evidence/issue-897/milestone-a-execution-20261029.md:23` retains only partial historical caller/closure evidence; `a-coordinator-dispatch-20261030.md:17` still leaves A-03 waiting. Governing requirement: `docs/evidence/issue-897/a-wayfinder-ticket-map-20261030.md:114`: “every required cell is green.” Diagnostic-only positives cannot establish cross-context privacy.

- **P1 — A-04 partial.** `docs/evidence/issue-897/a-04-reset-runtime-20261030/receipt.md:45`–`:55` leaves obsolete-campaign disposition, executor expiry/rollback, provider exclusion, actual storage drain and integrated restoration unproved. Governing requirement: `docs/evidence/issue-897/a-wayfinder-ticket-map-20261030.md:132` requires those lifecycle proofs. Offline and focused guard successes establish narrower behavior.

- **P1 — staff/release acceptance unproved.** `docs/evidence/issue-897/a-coordinator-handoff-20261030.md:27`–`:28` leaves protected multi-actor/race, native TK/RU/EN, combined CI, deployed restoration and exact APK/AAB evidence open. Governing requirements: `docs/prd/features/40-admin.md:175` requires consolidated browser/native/deployed verification; the ticket map at `:186` and `:230` requires green configured lanes and exact candidate-bound artifacts.

Current session/elevation, assignment and audience enforcement exists in source. Missing acceptance evidence demonstrates no exploit. B prototype completion and analytics activation remain out of scope. No files, refs or services were changed; no tests were run.

PR https://github.com/Carberk/carberk/pull/904, head b6dac5d17c140c8fd307a24df56d4a82ed070625, checks and reviews read-only audit, acceptance unproved.