# A-09R bounded retained-schema profile repair for A-04

**Accepted dependency finding: restoration profile is RED/open.** Independent
A-11 r4 retains A-04's restoration criterion; the A-04 receipt reproduces
`Schema snapshot and migration inventory mismatch`. Coordinator authorizes a
bounded prerequisite repair, not a declaration of runtime compatibility.

- **Owner:** one isolated delegated `codex_work`, `gpt-6.1-sol`, xhigh/priority,
  full access worker. Sole assembler and reset/deployment owner is the A
  coordinator. No nested agents, PR, shared staging or native work.
- **Exact base:** `2edf11b7e898a8f3adc5ac6b66ce4b907bffa40a`; assembled admin
  source/verification remains `4b2c8a6f6161f9c825945637f6f848c64adeb145`,
  original source `52d901c50af1dde97ea22bda8efb1fdf21f169b1`. Record actual
  immutable checkout HEAD/tree and prove intervening dispatch commits are
  docs-only before edits.
- **Allowed paths:** `scripts/staging-schema.mjs` closed profile data only;
  directly affected compatibility/negative tests in
  `scripts/staging-ledger.test.mjs` if necessary; this `profile-repair/**`
  evidence directory; ticket-local `/tmp/carberk-a09r-profile-20261030-*`.
  `evaluateSchemaPlan`, historical schema inventories/checksums, migrations,
  schema.prisma, reset executor/admission/guards, provider/controller code and
  all unrelated files are read-only. Any required expansion returns exact
  dependency/path/reason to the coordinator before an edit.
- **Dependencies:** both independent S2 reports; terminal A-04 receipt and
  `restoration-profile-red.json`; actual four SQL migrations and their accepted
  focused proof. Inspect source and tests, not just comments or a hash list.
- **Bounded finding:** current Prisma schema hash
  `21cdc52efb2fb1a9cabdfe0955cfe8d75e60147f9e6dd14f83f9e45bf3df4c45` omits
  migrations `20261026016200_diagnostic_maintenance_compatibility`,
  `20261026016300_diagnostic_registry_metadata_lookup`,
  `20261026016400_diagnostic_source_key_predicate`, and
  `20261029190000_operational_reset_row_admission`. There is no reported old
  checksum drift or missing historical migration. Inspect their function,
  ACL, guard, namespace and retained-data changes before adding any exact
  reviewed pin. If compatibility cannot be supported, report that dependency
  without weakening refusal. Do not distribute these additions into older
  schema inventories sharing a historical Prisma shape.
- **Required behavior:** the exact assembled 102-migration candidate can plan
  restoration to supported baseline code while retaining its exact reviewed
  additive SQL. Unknown schemas/migrations, checksum drift, historical
  removals and inventory mismatch must remain refused. No migration rollback,
  schema/code rewrite, new operator authority or extra SQL execution.
- **Offline verification:** preserve RED from
  `node --test --test-name-pattern='the assembled application schema can restore baseline code' scripts/staging-ledger.test.mjs`;
  GREEN with the identical selector after the bounded edit; then full
  `node --test scripts/staging-ledger.test.mjs` and
  `node --test scripts/staging-railway.test.mjs` if offline as source confirms;
  `node --check scripts/staging-schema.mjs`; `git diff --check`; explicit path
  audit, immutable dependency hashes and compatibility rationale.
- **Timing/CPU:** this plan is unlaunched; no slot is active. A single
  serialized offline Node verification slot will be reserved before a worker
  launches, after the A-02 worker's completed syntax/diff checks; the latter
  continues source audit/commit only. No other suite/build/timing work
  overlaps. Record actual start/end/duration and command argv. No CPU-affinity
  claim or performance conclusion. Root docs/Git/read-only work may continue.
- **Resources:** no Compose, DB, Redis, object store, ports, device, Railway or
  EAS. Existing tests may create their own private temporary Git repositories
  and fake boundary state; retain evidence and remove only owned scratch.
  Real migrations/resets/compatibility and hosted restoration remain serialized
  under the coordinator after assembly and review.
- **Non-goals:** no rerun of accepted full100/reset-cycle/staff/static proof,
  changes to row disposal, authority or expiry/caps; no B/analytics activation;
  no claim of A-04, deployed or milestone PASS.
- **Artifact/gate:** return source checkpoint, separate evidence-inclusive
  HEAD, exact commands/raw RED/GREEN/results, compatibility classification per
  SQL migration, complete diff/path audit and remaining real-DB/hosted gaps.
  Repair is acceptable only if bounded data changes preserve closed refusal
  behavior and affected offline suites pass. A-04 stays OPEN until its full
  runtime/restoration criteria pass; only Parent accepts A.
