# Private manual continuity proof source checkpoint

Bounded #914 implementation under #897 through sole PR #904. Root owns assembly, hosted execution and later scope. Reserved `agent/issue-914-private-proof-issuance-source-20261021` in the host-owned isolated worktree from `7283f2f1318a7208a5266e7a1762dba14c07184e`, tree `e5061622216da17eb48a5a9338c84de84da06d4b`. Targeted RED is `e36dc5ff`; source checkpoint is `3d62153717899bf1b7870db72f7839340b94a2cc`, tree `76b4880b14fa57f10ea7ae0642aacfacc0c9c238`. This receipt adds documentation only.

[ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md), the [next-RED contract](diagnostic-pair-proof-next-red-contract-20261021.md), [identity capture contract](diagnostic-identity-evidence-capture-contract-20261021.md), [original issuance RED](diagnostic-private-proof-issuance-red-20261021.md) and [security checkpoint](diagnostic-private-proof-security-tests-20261021.md) govern. Comparative authority is already approved. Real rights/retention/hold schedules and center qualification provisioning remain separate readiness gaps.

## Authoritative base result

Root classified PR Checks run `39679193185`, [API job `119497114965`](https://github.com/Carberk/carberk/actions/runs/39679193185/job/119497114965), on the exact supplied base. All 66 proof tests reach missing-route 404 after successful setup. Original expected 201 at `DiagnosticContinuityProofIssuance.e2e.spec.ts:304:29` and direct unauthorized issuance expected 403 at refused helper line 421 are reached. Read-dependent tests stop at ordinaryProof expected 201 line 437; downstream read assertions are unreached. There are no catalog-collision setup failures.

API: 3,086 pass / 69 fail out of 3,155; 66 missing-route failures and three protected legacy CampaignFullV3 tails. Worker: 373 pass. Frontend/static pass. The three legacy failures are outside this writer's scope. Raw log `/tmp/carberk-resume-20261021/7283f2f1-api-119497114965.raw.log`, SHA-256 `51ec15c8b43a2685e351fea6315b5f5a72b3dc98e818cb8ceee8618a7835c605`, verified locally. This source checkpoint has no hosted runtime result.

## Source and contract

The strict POST accepts only comparative attestation; automatic/public-transfer methods and client-owned proof/actor/audience/rights/result fields are malformed input. Query objects are strict, successes and errors private/no-store, POST returns only a generated proof id, and GET projects the proposed minimal restricted envelope.

The application use cases use a proof-owned atomic persistence port. The adapter reuses the real comparison path and its immutable A report pins, including after A has a newer raw observation. Identity's new public participant-binding port owns sorted User/Session/grant locks and current participant bindings; diagnostic assignment and qualification remain diagnostic-owned. No identity internals are imported across the context boundary. Domain comparison stays framework-free.

Issuance requires current elevated reviewer authority independently on both orders, a distinct current assigned and qualified B linking technician, both ordinary physical authorizations, same nonnull historical commissioner and private audiences, finalized/withdrawn unerased A without a successor, and arrived independent B without a report. It checks exact versions/raw pins only after both-order reviewer authority. Missing, contradictory, foreign, omitted or unretained evidence/provenance refuses generically. This slice supports consistent manual identifiers, not justified corrected mismatches. The current technician need not acquire comparative issuer authority.

One transaction persists one proof and one content-free issuance audit. It creates no report/successor and changes neither order version. Server-only bindings retain audiences and each historical commissioner, private conditional Listing binding (`null`), exact report/raw/evidence/provenance/classification hashes, issuer/session/grant binding, assignment/qualification hashes, order versions/epochs, evidence generations and physical-authorization/observation hashes. Identity/evidence/provenance records and relevant assignments/qualifications are locked and reread. No issuance retry deduplication or blanket TTL was added.

Proof GET accepts currently qualified technicians or reviewers independently assigned on both visits. It checks current access, bound retained raw/evidence chains and rights before returning the strict original envelope. It grants no commissioner, B-only, unassigned, admin-only or public access. A source mutation permanently marks the unused proof invalidated; a value reversal cannot clear that marker. Historical restricted reads may remain available after ordinary invalidation, while current authority and lifecycle fences still apply. Consumption is not implemented.

## Persistence and lifecycle boundaries

`20261021140000_diagnostic_continuity_proofs` is additive, with no legacy backfill. Table/index/FK SQL was generated through repository `prisma.config.ts` using schema-to-schema `prisma migrate diff --script` against the exact base schema. A syntactically valid unused local URL satisfies config loading; no database was contacted. Custom SQL adds immutable content/binding guards and irreversible source invalidation. The retained schema inventory and protected reset manifest include the exact new schema, table and trigger names with SQL bytes; operational readiness is unchanged. A repeat generation matched the committed DDL prefix and exact retained SQL copy. Applying the migration, trigger execution and compatibility on PostgreSQL remain hosted gates.

Retention is the earliest declared authorization deadline across retained evidence and provenance. The domain test proves that policy choice; it is not runtime proof of worker cleanup. Account purge removes the whole restricted proof and both-visit linkage for an erased commissioner/issuer/linking technician. Bound identity/evidence/provenance erasure or cleanup fences remove dependent proof records. The existing artifact worker deletes proofs past their declared deadline in bounded batches. No hash is treated as anonymous, no hold is invented, and no new retention period is introduced.

All four existing `packages/db/scripts/staging-clean-reset*.e2e.spec.ts` files and both existing CampaignFullV3 API suites were compared byte-for-byte with the base and remain unchanged. The complete 66-test proof suite, including its original positive body and old assertions, is byte-identical after removing the one necessary teardown line: `diagnosticContinuityProof.deleteMany({ where: { candidateOrder: { centerId } } })`, before owned reports/orders are removed. No production reset or activation ran.

## Offline evidence

| Criterion / gate | Exact evidence | Result |
|---|---|---|
| Manual attestation and earliest declared-rights boundary | `pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts`; RED at `e36dc5ff`, two valid cases fail `DIAGNOSTIC_NO_ACCESS` and five refusal cases pass; same seven pass after source | pass, domain only |
| Existing private HTTP assertions remain discoverable | `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts --staticParse=false --json=/tmp/issue914-collected.json` | pass, 66; hooks/assertions not executed |
| Repository unit gate | `DATABASE_URL=postgresql://unused:unused@localhost:5432/unused pnpm test:unit` | pass, 10 Turbo tasks; API 2,425 pass / two existing skips; worker 292, contracts 567, DB 119 |
| Repository typecheck | same offline URL, `pnpm typecheck` | pass, 11 Turbo tasks |
| Affected lint | `pnpm --filter @auto-tm/{api,worker,contracts,db} lint`, each separately | pass |
| TypeScript 6 | `pnpm --filter @auto-tm/{api,worker,contracts,db} exec tsc6 --noEmit`, each separately | pass |
| Documentation/runtime boundaries | `pnpm check:agent-docs`, `pnpm check:glossary`, `pnpm check:runtime-imports`, `git diff --check` | pass |
| Existing schema inventory guard | `node --test scripts/diagnostic-identity-evidence-schema.test.mjs scripts/staging-clean-reset.test.mjs` | pass; static inventory evidence only |
| Exact HTTP/PostgreSQL/storage issuance/read behavior | root's same security suite on assembled candidate | blocked pending hosted execution |
| Lifecycle/invalidation/atomicity | implementation inspection only; no new executed DB/storage proof | unproved |

The broader `pnpm test:root` run completed with 588 pass / two fail / one existing skip (591 total). Its only failures were the existing exact table/trigger manifest assertions, because the new proof table and eleven triggers were absent from `staging-clean-reset.tables.json`. The follow-up adds those exact names without editing either test. The affected rerun, `node --test scripts/staging-clean-reset.test.mjs scripts/staging-clean-reset-remote.test.mjs scripts/diagnostic-identity-evidence-schema.test.mjs`, passes 25/25. Full root output is `/tmp/issue914-root-offline.log`; affected GREEN is `/tmp/issue914-reset-manifest-all-green.log`. The full long suite was not rerun after this manifest-only fix. This is offline plan/manifest evidence, not a reset execution or host-guard refusal.

Initial root unit/typecheck attempts failed before checks because `DATABASE_URL` was absent from Prisma config. Repeating with the offline placeholder above passed; no dependency change or runtime service was used. Logs are `/tmp/issue914-root-unit-env.log`, `/tmp/issue914-root-typecheck-env.log`, `/tmp/issue914-{api,worker,contracts,db}-{lint,ts6}.log`, `/tmp/issue914-private-attestation-{red,green}.log` and `/tmp/issue914-collected.json`.

Docs: [Prisma 7 CLI reference](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference) and installed CLI help verified schema-to-schema migrate diff, `--script`, `--output` and repository config. Installed Prisma 7.8.0 was published 2026-04-22. Other changes use existing repository APIs/business contracts; no external dependency or service was added or upgraded.

## Required next evidence and scope

Root inspects this checkpoint, assembles it with the independent DB restart repair and publishes the same security tests for exact-candidate GREEN before widening scope. Local typecheck/unit/collection cannot establish HTTP success, migration correctness, locking order under contention, rollback of proof/audit on failure, or restricted lifecycle behavior.

Unproved: isolated A-only erasure with surviving other material, retained null/legacy pins, rights-expiry cleanup and referenced-chain cleanup on actual storage, issuer/linking-technician deletion detachment, concurrent issuance/authority loss, atomic audit failure, monotonic invalidation on actual mutate/revert, and generation/race interleavings. The newly added lifecycle/invalidation SQL and public participant-binding adapter have not received new executable PostgreSQL RED/GREEN beyond the hosted base's issuance/refusal contract; that evidence gap is explicit.

Still subsequent: automatic VIN, both mixed manual/VIN directions, justified corrected mismatches, public seller/Listing/commissioner transfer, proof consumption, exact retry, successor contention, mutate/revert race acceptance, and surviving B after consumed A erasure. Existing reinspection consumption input and temporary link admission are unchanged. This is neither full lifecycle proof nor ADR-0108 completion.
