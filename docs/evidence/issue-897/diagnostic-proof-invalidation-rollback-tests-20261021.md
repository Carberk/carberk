# Diagnostic proof invalidation and audit rollback tests

Test-only #914 handoff under #897, sole integration PR #904. Root owns inspection, assembly and hosted execution. This writer opens no PR and changes no production source, migration, schema, CI, transport helper or reset specification.

## Reservation and authority

- Supplied base: `96c0c844cdfed5a0e5f1ce658e6788ea65d14f90`.
- Supplied tree: `1884ce1a76650555a4b0cef55d981b27d6c92af7`.
- Owned host worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-f9362233`.
- Reserved and pushed `agent/issue-914-proof-invalidation-rollback-tests-20261021` at that exact base before editing.
- Host scaffold `t3/proof-invalidation-rollback-tests` remains at the supplied base.
- Governing policy: accepted ADR-0108, feature 50, flow 66, diagnostic overview, glossary and the bounded root dispatch. No broader #914 closure is claimed.

Root supplied a completed exact-base hosted receipt during this task: all original 66 proof HTTP cases passed; API 3159/3162 and worker 373/373. The three API failures are unchanged CampaignFullV3 Support/media reset tails. Root also reported DB 390/391 with the sole failure in unrelated pre-restart setup. This writer did not execute or independently reproduce those hosted runs. These receipts do not establish runtime results for the additions below.

## New cases and assertion boundaries

Executable collection expands the existing suite to **69 cases**, with these three additions:

1. `permanently invalidates an unused proof after ordinary candidate assignment revocation and reassignment`
2. `permanently invalidates an unused proof after ordinary predecessor assignment revocation and reassignment`
3. `rolls back a proof when the real PostgreSQL audit INSERT fails for this candidate`

Each case first uses the existing ordinary pair, retained evidence, comparison, POST issuance and restricted GET helpers. Failed positive issuance/read is a setup failure; later persistence assertions are unreached and cannot establish valid RED.

The invalidation cases revoke and restore the reviewer's assignment through ordinary reception HTTP. Persisted assignment revocation/restoration and literal order versions 7, 8 and 9 prove real transitions. Setup has evidence generation 1 and finalized report version 3. Assignment changes preserve that immutable report version. The unused proof starts with null `invalidatedAt`, receives a persisted timestamp on revocation, then retains the exact timestamp and every other persisted proof field on restoration. The still-authorized technician reads the exact original historical content after revocation; the restored reviewer reads it afterward. Restricted reads retain private/no-store headers. No consumption behavior is introduced or asserted.

HTTP is the authority/issuance/read interface. Direct DB reads are limited to durable invalidation, real assignment/version persistence, and atomicity facts for which no audit/proof persistence HTTP reader exists.

## Exact PostgreSQL failure fixture

The rollback case refuses DDL unless Vitest supplied its per-worker database descriptor and PostgreSQL `current_database()` equals that exact worker name. The fixture lives only in that disposable worker database.

After ordinary successful issuance/read on the same pair, the test snapshots real orders, reports, commissioner report representations, audits and the exact candidate's proof rows. It installs a transactionally created schema, sequence, function and audit INSERT trigger. Names derive from the fresh candidate UUID and remain below PostgreSQL's identifier limit. All interpolated row IDs pass the UUID oracle first.

The trigger's `WHEN` matches only this exact candidate order, center, reviewer actor and `CONTINUITY_PROOF_ISSUED` action. Other audit writes do not execute the function. Inside that exact audit INSERT, the fixture advances its own sequence only when both the already issued proof and the new attempted proof are visible for this exact pair. It then raises a PostgreSQL exception. The sequence is a nontransactional fault receipt; it never creates a proof, identity pin or audit.

The ordinary POST must return 500, the receipt must show exactly one hit, and all business snapshots must equal their pre-fault values. Thus a generic unrelated 500, an audit failure reached before proof insertion, or a surviving partial proof cannot pass. Stored reports and ordinary representations detect hidden draft/successor changes; full order rows detect version/generation changes; exact proof/audit rows detect partial persistence.

Installation is atomic, and `finally` transactionally drops the exact trigger, function, sequence and empty schema without CASCADE or global trigger disabling. A cleanup error fails the test. Successful cleanup is checked in `pg_namespace`; the same ordinary issuance/read then succeeds and adds exactly one proof and issuance audit while orders/reports remain unchanged. Root must verify this seam against hosted PostgreSQL; offline collection cannot establish its SQL/runtime behavior.

Docs: [PostgreSQL 16 CREATE TRIGGER](https://www.postgresql.org/docs/16/sql-createtrigger.html) verifies row-level BEFORE INSERT and WHEN filtering. [PostgreSQL 16 sequence functions](https://www.postgresql.org/docs/16/functions-sequence.html) verifies that nextval is not reclaimed after transaction abort. The repository CI composition specifies PostgreSQL 16. No external dependency/version changed.

## Executed offline checks

Logs and collection-only config are in `/tmp/proof914-offline`. No local Docker, PostgreSQL, Redis, S3, live Railway, quota call or service execution occurred. Prisma generation/build used only inert `postgresql://unused:unused@127.0.0.1:1/unused`; it did not connect.

- Contracts build and DB generation/build: pass.
- API full lint: pass. Affected-file lint repeated after final edits: pass.
- API TypeScript 7 and TypeScript 6 checks, repeated after final edits: pass.
- `pnpm test:unit`: 10/10 workspace tasks successful, nine cache hits; API executed 2,425 passing tests with two existing skips. E2E cases were excluded.
- `pnpm typecheck`: 11/11 workspace tasks successful, ten cache hits; API executed successfully. Its affected checks were repeated after final edits.
- `pnpm check:runtime-imports`: DB and contracts pass.
- `pnpm check:agent-docs`, `pnpm test:agent-docs`: pass, 8 test cases.
- `pnpm check:glossary`, `pnpm test:glossary`: pass, 40 test cases.
- `vitest list --config /tmp/proof914-offline/collect.mts --no-static-parse --json`: 69 executable imported/expanded cases. Config explicitly has empty globalSetup/setupFiles, includes only this suite, and uses the API root. No hooks or test bodies ran.
- `git diff --check`: pass.
- Protected oracle: removing only the new case block and the two added imports reproduces the entire base suite byte-for-byte, including every original case body, hook and helper. Every other tracked source/test file is unchanged, including all reset specs and PG transport helpers.

Selected log SHA-256 receipts:

- `collection.json`: `9b671c932fc319fefac8a72b02740334c717d53b68611943966578d676e3e45e`.
- `unit.log`: `feadd2a3ca9d34751a31f72f8e34c5eaceb75dac2944ba0990d300e253b3e1d7`.
- `typecheck.log`: `2541c35ae7745448d5833353cea82a5fd8bbb5c8ecd38460a67d07a5dfe86c12`.

## Remaining gates and owner

Root must inspect and assemble this test-only checkpoint, then run the affected suite with the real PostgreSQL/current-authority/storage composition on the exact assembled candidate. All three new runtime outcomes, PostgreSQL fault installation/reach/cleanup, rollback and permanent invalidation remain **unexecuted** here. A positive setup failure must be classified before any new criterion is called RED. Root must observe any genuine hosted failure before source repairs.

Existing reset failures remain independently owned. No new report consumption, automatic VIN, corrected mismatch, public transfer, race, broader erasure or unrelated lifecycle work is included. The diagnostic overview's existing ownership and limitations remain accurate. Writer stops at pushed handoff.
