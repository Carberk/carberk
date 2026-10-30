# Private manual/manual proof consumption assembly

Bounded assembly of the #914 [source slice](diagnostic-private-manual-consumption-source-20261021.md) for #897 onto integration base `e56e9d84ace21e3924817acb094ea5b761baa55c`. Sole integration PR #904 and remote `agent/spec-897-campaign` (at `e56e9d84` when inspected) were not changed. Branch `agent/spec-897-private-consumption-assembly-20261021` was reserved and pushed at `e56e9d84` before the cherry-pick. The host scaffold branch `t3/private-manual-consumption-assembly` was unchanged at `e56e9d84` and was renamed into it. This writer ran no Docker, local services, Railway, deployment, reset, merge, promotion or store action, and opened no PR.

## Assembly

- Source `8e5dc539eb82e943ce7f4098ff6b3590f0c5f31f`, a single commit on `b9f32d62`, was cherry-picked with `-x` as `f5d09ce3`. There were no conflicts. `git diff b9f32d62 8e5dc539` is byte-identical to `git diff e56e9d84 f5d09ce3`: 13 files, 569 insertions and 77 deletions.
- The source files do not overlap with `b9f32d62..e56e9d84` (`6cd1f51f`, `299670ad`, `e56e9d84`). The PostgreSQL attribution instrumentation (`scripts/testing/query-disposable-postgres.cjs` and its test) and the e56 interrupted-Redis spec are unchanged by the assembly.
- No production behavior was added beyond the source slice. The temporary public equal-VIN fallback remains.

## Inspection

- Scope: the 13 files are contracts (optional strict `proofId`), the API diagnostics use case, port, module, controller, both Prisma adapters, diagnostics `CONTEXT.md`, the Prisma schema, one forward migration, its retained copy, the retained-schema registration and the source evidence. No test file changed.
- Migration `20261021150000_diagnostic_continuity_proof_consumption` adds only nullable columns, two unique indexes and two CHECK pairs that hold trivially on existing rows. There is no backfill and no existing migration is edited. Its DDL header equals a fresh offline `prisma migrate diff --from-schema <e56 schema> --to-schema prisma/schema.prisma --script`. The replaced `diagnostic_continuity_proof_guard` insert predicate is the 20261021140000 predicate moved verbatim into `diagnostic_continuity_proof_bound`. `diagnostic_continuity_source_changed` adds only `"consumedReportId" IS NULL`. Against 20261021100000, `diagnostic_report_pinned` adds only the proof branch and immutability for the two new columns; the public branch is unchanged. The migration equals the retained copy, and its SHA-256 `f25d566779839d76749f9320ba102d6e282fbba365468c68e0d49eeed460a222` equals the registered checksum. No table or trigger was added, so the reset tables manifest is unchanged.
- Only the API consumes `DiagnosticReinspectionSchema`. Mobile, admin and web have no consumer.

## Protected files

Byte-identical across `e56e9d84` and the assembly head (git blob and SHA-256 at e56):

| File | Blob | SHA-256 |
|---|---|---|
| `apps/api/src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts` | `9ed6c852` | `d7741dd07628ef533aaa2e30af152bd673dafb45c2ea83cab3cb1f4b3d16acff` |
| `apps/api/src/modules/diagnostics/presentation/CampaignFullV3Diagnostics.e2e.spec.ts` | `55b119bf` | `80816c61234aae876b02558024b8573d718ce0efbee62b7355e69c53ed002213` |
| `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` | `d20d7ede` | `780303324cd2402cd4af10bfe41cff33a1492990780fc7262727b5bd50693779` |
| `packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts` | `dd5d3c95` | `f54d0577f632133e1e783d1a9a466587d8561bfd20f6862c2a601ec04c44aefa` |
| `scripts/staging-clean-reset.test.mjs` | `8a93a9fb` | `ef8e6bf88235ad12903bf4f96726871075ecd6b26da3b2221fc265dc2930eacc` |
| `scripts/staging-clean-reset-remote.test.mjs` | `5016dc60` | `ec36ff80885693ebd6fc3e5eac310b2b91c732e24eb248baff54a884a346ed49` |
| `scripts/staging-clean-reset.tables.json` | `ed7bb2ee` | `947cc7dcd8fcc1c34ae68b3af33dc6e8ef67a272659f688a9c8d1d1306846d98` |

The interrupted-Redis spec differs from the b9 value in the source evidence (`b6fb5f4f…`) only because of `299670ad`. The source did not touch it, and the e56 bytes are retained.

## Combined offline verification

Run on the assembled tree after `pnpm install --frozen-lockfile`. Prisma used a synthetic unreachable `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/synthetic`, and nothing connected to it. The logs are under `/tmp/asm897/`.

| Command | Result |
|---|---|
| `pnpm --filter @auto-tm/db generate`; `pnpm --filter @auto-tm/db exec prisma validate` | pass |
| `pnpm --filter @auto-tm/contracts build`; `pnpm --filter @auto-tm/db build` | pass (the first db build ran before the contracts dist existed in this fresh worktree and failed with TS2307; it passed after the contracts build) |
| schema-to-schema `prisma migrate diff` from e56 | equals the migration DDL header |
| `pnpm --filter @auto-tm/contracts openapi:generate` | pass, no working-tree drift |
| `pnpm --filter @auto-tm/api typecheck`; `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | pass |
| `pnpm --filter @auto-tm/{api,contracts,db} lint` (full packages, `--max-warnings 0`) | pass |
| `pnpm --filter @auto-tm/worker typecheck` | pass |
| `pnpm typecheck` | 11/11 tasks |
| `pnpm test:unit` | 10/10 tasks; api 261 files, 2425 passed, 2 skipped; contracts 567; db 119; worker 292; mobile 3806; admin 330; web 184; sms-gateway 3; agent-github 8; native-session 29 |
| `node --test scripts/testing/query-disposable-postgres.test.cjs` | 12/12 (mocked; attribution instrumentation preserved) |
| `pnpm test:root` | 590 pass, 1 skipped, 0 fail |
| `pnpm test:agent-docs`; `pnpm check:glossary`; `pnpm test:glossary` | 8/8; ok (31 terms); 40/40 |
| `pnpm check:runtime-imports` | pass |
| `git diff --check e56e9d84 HEAD` | pass |

Docs: no external lookup was needed. Only existing Prisma CLI, PostgreSQL and Zod usage already present in this repository was applied.

## Runtime status

Base `e56e9d84` hosted run [39697405425](https://github.com/Carberk/carberk/actions/runs/39697405425) is terminal. Lane, static and frontend pass, docs skip, and API, DB and `pr` fail. The parent classifies the results as follows:

- **DB:** 390/391. The pending-PG Redis restart case fails before its intended assertion. A same-observation loopback `pg_isready` backend (480, at child218) caused the initial inventory refusal.
- **Worker:** 373/373.
- **API:** 3162/3171. Six private consumption first POSTs return HTTP 400 instead of 201, the intended RED at lines 503, 547, 566 (three parameters) and 587. The three unrelated CampaignFullV3 reset tails are unchanged.

No production repair is established. This assembly preserves those classifications. It claims no hosted GREEN and has not run PostgreSQL, so migration apply, triggers, locks and the six consumption cases remain runtime-unknown.

## Remaining gates

- Hosted CI on this exact assembled head, through the parent's candidate:
  - The six consumption cases must reach GREEN.
  - The 69 issuance cases must stay GREEN.
  - The three CampaignFullV3 reset tails must be confirmed unchanged and separate.
  - The DB pending-PG restart attribution must be reclassified on its own evidence.
- Independent Standards/Spec review, parent fast-forward of `agent/spec-897-campaign`, shared-staging acceptance and staging restoration remain with the parent.
- Concurrency and erasure-after-consumption acceptance, automatic/mixed/corrected/public-transfer admissions and the full ADR-0108 replacement of the public fallback remain separate slices.

## Parent publication inspection

Root independently compared stable patch ids for b9→8e5 and e56→f5d09ce3 (both `2e78fa5b0171654f920255179438894d8c8be674`), checked all seven protected files plus both attribution files byte-for-byte, inspected the complete source/migration diff and checked the combined unit/typecheck logs. The current main `9fde309c3da17f2661fe9c266504e6e56a1b97c9` is already an ancestor. Root fast-forwarded the owned checkout to `928eee90` without conflict. The [terminal e56 receipt](../issue-901/prelaunch-hosted-receipt-e56e9d84-20261022.md) now preserves the exact preceding runtime failures and log hashes. Final independent Standards/Spec review remains a later gate on the complete candidate; this inspection is assembly evidence. No hosted GREEN is claimed for the changed runtime.
