# Reception registry and consumed-erasure fixture repair, attempt two

This isolated TEST checkpoint starts at `f74139ae6a0f2db5b76b7f18c88e95ff9c14b643`, tree `0ac990b50a043e6cc09beccdda5a5764c5a4a721`. Its reserved branch is `agent/issue-914-fixture-oracle-attempt2-20261022`, pushed at that exact base before edits. The host scaffold branch was `t3/27e9467c` at the same base. Root remains sole assembler for #914 within founder-selected full #897, through sole integration PR #904. This writer created no PR or children and did not push the integration branch.

## Observed failure and source authority

The [c4 hosted receipt](../issue-897/public-transfer-assembly-and-c4-hosted-receipt-20261022.md) belongs to candidate `c4df4ad7116058b39e1b631c161bb79f1a241f86`, [run 39832909999](https://github.com/Carberk/carberk/actions/runs/39832909999), [API job 120014324771](https://github.com/Carberk/carberk/actions/runs/39832909999/job/120014324771). Its local logs were read, without CI polling or rerun. Raw `/tmp/carberk-resume-20261021/c4-api.log` SHA-256 is `ae4b9dff646672c7a7e17c99c4240aa525c1461a7fa5274497dd22f77dcf4117`; ANSI-stripped `c4-api.clean.log` SHA-256 is `9e9f7545bef35ad2a03c7542d591d3a774cffb7f1a6c0063f20318c33615ec63`.

The observed API result was 3,203/3,211, eight failed cases across five files plus teardown failures. Worker tests passed 373/373 on that historical candidate. Mixed manual/VIN in both directions reached issuance 403 where 201 is required, at historical spec line 320. C1 reached the same genuine product failure at historical line 391. Their assertions, setup and positive journeys remain unchanged except for the requested fixture registry addition. The other observed failures were improvement scorecard `unavailable` versus `accepted`, one full-v3 Support reset-tail barrier timeout, and publish/attach reset-tail PUT timeouts. Those remain outside this repair.

Mixed and consumed teardown hit `diagnostic_identity_evidence_immutable`. C1 separately refused exactly two unregistered assignments. [Intake source](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts) creates each order with currently eligible reception assignments. These five fixtures each seed one known eligible reception actor. Each now registers exactly its own reception user, `diagnostics.reception` capability and returned order ID immediately when that request returns the ID, before later assertions. No discovered assignment row becomes deletion authority. Existing mixed/C1/C2/P1 preflight fences and guarded parent cascade teardown are byte-identical.

Consumed expiry failed with expected403/got200 at historical lines 325/342/345. [Identity-evidence source](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts) authorizes the reader, filters unusable records in `graph`/`list`, and returns the remaining list. [Existing expiry coverage](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticIdentityEvidence.e2e.spec.ts), lines 490-506 at this base, explicitly requires authorized list200 with no expired records. The consumed test now requires exact200 and `[]`, private/no-store headers and all existing secret non-disclosure checks for both staff roles at expiry and again after the actual worker. Proof, provenance bytes, comparison and comparison-provenance bytes keep exact403, uniform error-body and no-secret assertions. Before expiry all previously successful endpoints still require200, and the earlier retained byte/content assertions remain intact. Unknown handles keep exact denials.

## Scoped cleanup adaptation

Consumed teardown copies the inspected mixed fixture's guarded request-registry pattern. Its additional registry tracks exact Session IDs, staff grant tuples, explicit qualification IDs, request keys, assignments, finding IDs and PDF keys. Qualification UUIDs are fixture input, not adopted rows. Existing request/response registration still owns reports, raw identity, structured evidence, provenance and proofs. PDF keys come from returned artifact IDs and the exact report key format; a separate `pdfKeys` set preserves the worker's original two-provenance-key equality and manifest.

Before any object or database mutation, cleanup checks registered order bindings, descendant IDs and cross-order report pins, report findings, provenance/PDF key bindings, audits, absence of report evidence, unknown assignments, center orders/templates/qualifications, every User collection relation count and singular TOTP/notification preferences, and every Session descendant count. Unknown descendants refuse cleanup before mutation. None of these inspections expands the registry.

Only request-registered object keys are deleted and verified absent. Any object failure preserves all database rows. Then exact proof/PDF rows and reports in reverse registration order leave, followed by exact audit/assignment bindings. Immutable raw/evidence/provenance rows leave only through the registered order parents, guarded by center, commissioner and request keys. Exact templates, qualifications, center, Sessions and grants leave before each zero-descendant User deletion. There are no direct identity-child deletes, trigger changes, replication-role changes or broad ownership adoption.

This is focused fixture root-failure repair attempt two. The no-production-change exemption applies to fixture/oracle corrections. No new RED/GREEN claim is fabricated. Genuine mixed/C1 issuance RED evidence remains required product work.

## Offline verification

All logs, temporary config and preservation scripts are under `/tmp/carberk-914-fixture-oracle-attempt2/`. Node was `v24.13.0`; pnpm was `12.11.2`. The configured commands were used without changing configuration or dependencies.

- `pnpm install --frozen-lockfile --offline`: PASS, 2,034 reused packages, zero downloads. `install.log`.
- `pnpm --filter @auto-tm/contracts build`: PASS, direct fresh build. `contracts-build.log`.
- Initial `pnpm --filter @auto-tm/db build`: stopped because Prisma config requires `DATABASE_URL`; no connection or service was attempted. `db-build.log`.
- `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/compile_only pnpm --filter @auto-tm/db build`: PASS, direct generation/build without connecting. `db-build-compile-only.log`.
- `pnpm --filter @auto-tm/api typecheck`: PASS, direct TypeScript7 check. `api-typecheck.log`.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: PASS, direct TypeScript6 check. `api-tsc6.log`.
- `pnpm --filter @auto-tm/api lint`: PASS, complete workspace, zero warnings. `api-lint.log`.
- `pnpm --filter @auto-tm/api build`: PASS, direct Nest build. `api-build.log`.
- `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/compile_only pnpm test:unit`: PASS, 10/10 tasks, nine cached. API was fresh, cache key `fc8876047fc4e705`, 261 files, 2,438 pass and two existing skips. Root agent-GitHub eight tests and native-session 29 tests ran fresh. Sibling task output was shared-worktree cache reuse. `root-unit.log`.
- `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/compile_only pnpm typecheck`: PASS, 11/11 tasks, ten cached. API was fresh, key `97ecc5af412edcbf`. `root-typecheck.log`.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/carberk-914-fixture-oracle-attempt2/collection.config.mts --staticParse=false --json`: PASS, actual import-based collection106, empty stderr. Absolute paths select original comparative99 + mixed2 + automatic1 + consumed1 + C1 + C2 + P1. Temporary config sets `globalSetup: []` and `setupFiles: []`. No hooks or bodies ran. `collection.json`, `collection-counts.json`, `collection.stderr`; collection JSON SHA-256 `69901d7ae562a2da1006aafa74be103cd484dac12bf913eab540ad96b10d5755`.
- `pnpm check:agent-docs`, `pnpm check:runtime-imports`, `pnpm check:glossary`: PASS, links/policy routes, both runtime package imports, 31 glossary terms. `agent-docs.log`, `runtime-imports.log`, `glossary.log`.
- `pnpm test:agent-docs` and `pnpm test:glossary`: PASS after adding this evidence note. `agent-docs-tests.log`, `glossary-tests.log`.
- `git diff --check`: PASS. `python3 /tmp/carberk-914-fixture-oracle-attempt2/preservation.py`: PASS as detailed below.

Docs: no external dependency/service interface or implemented behavior changed. Existing source, schema and neighboring tests establish the correction; no external documentation lookup was needed. Diagnostics ownership, runtime boundaries and glossary vocabulary are unchanged, so their overviews need no edit.

## Preservation and remaining runtime evidence

The only changed existing paths are the five authorized E2E specs; this is the only added note. `edits.json` records 19 exact before/after transformations. Reversing only those cleanup/oracle/registry transformations reconstructs each entire original file byte-for-byte. Thus every remaining helper, setup value and positive journey stays exact, including every mixed/C1 issuance assertion and all C2/P1 assertions. `preservation.json` records original and candidate byte hashes and each permitted transformation.

An independent comparison of the full consumed worker/isolation/manifest and post-worker literal-assertion block finds all 9,309 bytes unchanged, SHA-256 `34b86dd3ac1f8bfbf18a66d1bc17083a1275729168d99c8e0e4e706d55ecb8b2`. The entire consumed body reconstructs exactly after reversing only the authorized expiry-oracle edits and its two PDF/finding registry additions. B independence, exact retry and finding writes, the real subprocess, all-row erasure manifest/isolation refusals, erasure state literals and unknown-handle refusals remain intact.

All other 4,136 existing tracked paths match their base Git blob IDs and bytes. Sorted path/blob/SHA-256 manifest digest is `5b686821ccf4a3eceb26fa0ccc32c58b1a1447faff2d29053882f38059ee96bf`, stored in `unchanged-manifest.json`. This includes the original99 security suite, all reset/guard/budget code and tests, production source, schema, migrations, contracts and CI. Full paths and per-file original hashes are in `preservation.json`; no hidden protected-path exception was taken.

| Criterion | Evidence | Result |
|---|---|---|
| Exact intake reception registration, no weakened existing fences | Four minimal registry diffs; consumed explicit registry; full-file reconstruction | PASS offline |
| Authorized expired evidence list200 `[]`, restricted material403 | Current source and neighboring expiry oracle; scoped oracle diff and unchanged no-secret checks | PASS source inspection; hosted runtime UNKNOWN |
| Guarded consumed teardown, no direct immutable-child deletes | Inspected preflight/object-first/reports-then-parent cleanup; API checks | PASS offline; hosted cleanup UNKNOWN |
| Substantive worker/isolation and surviving-B assertions preserved | Independent 9,309-byte equality, full-body reconstruction, collection106 | PASS preservation; worker acceptance UNKNOWN |
| Applicable offline gates and protected paths | Commands above and all 4,136 unchanged base paths | PASS |
| Mixed/C1 product criteria, C2/P1 execution and consumed worker journey | Historical failures retained; no HTTP bodies executed here | BLOCKED pending Root's hosted candidate run |

No local Docker/services, destructive staging HTTP, Railway operation, refusal retry, credential discovery, reset, deployment, CI dispatch/rerun/cancel/poll, external message, merge, promotion, submission or launch occurred. Root's next runtime action remains hosted HTTP on its assembled candidate. Collection and unit checks do not establish worker, teardown or full product acceptance.
