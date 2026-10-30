# Private manual/manual proof consumption source slice

GREEN source writer for #914 within #897, after the hosted RED on exact `b9f32d62e38a07f056f639dc37ec4f6d585f7162` (run 39694240024, API job 119547846812). In that run, six new `DiagnosticContinuityProofIssuance` cases failed with HTTP 400 at the proof-bearing reinspection POST, and the original 69 passed. Branch `agent/issue-914-private-manual-consumption-source-20261021` was reserved and pushed from that commit before editing. This writer opens no PR and runs no containers, live services, Railway, credential or quota calls. The parent owns hosted runtime verification.

## Behavior

- `DiagnosticReinspectionSchema` stays strict and accepts an optional `proofId`. A proof-bearing request is routed to `ConsumeDiagnosticContinuityProof` and `PrismaDiagnosticContinuityProofs.consume`. A request without `proofId` keeps the temporary public equal-VIN path. Its exact-retry check now also treats a changed or missing proof binding as a conflict; public rows bind none, so public behavior is unchanged.
- New consumption follows the issuance lock order. Identity binds the issuer (with the issuer's own Session) and the linking technician, exactly as at issuance. Then come Listings, orders in id order, the issuer's current reviewer authority on both orders (`compared` plus `authority.order` on each), the acting technician's own Session and B technician authority, and the predecessor report row. Next are the bound assignment and qualification rows, and the proof row is locked last.
- Checks run under those locks. The proof must be bound to this B, this A report, A's order, its issuer and Session, and this technician. A consumed proof returns `DIAGNOSTIC_REINSPECTION_CONFLICT`. An invalidated, erased or expired proof, or rights that have lapsed, returns generic denial. A must have no successor; this returns generic denial so the predecessor fact stays hidden. If B already has a first report, the result is `DIAGNOSTIC_REPORT_EXISTS`. A changed B version returns `DIAGNOSTIC_STALE_VERSION`. The bound A/B content has to match the current comparison, and the full recomputed binding digest has to match the stored one: visit versions, epochs, evidence generations, authorization and observation hashes, authority generations, evidence pins, staffing and rights hashes.
- If every check passes, the transaction marks the proof consumed, creates B's own empty draft and writes `REPORT_REINSPECTION_CREATED` plus `CONTINUITY_PROOF_CONSUMED` (`details: { reportId }` only). The draft uses B's date, mileage, pinned template and pins, and has no findings, evidence or PDFs. Any refusal rolls the whole transaction back.
- An existing report id is an exact retry. It takes the same order/report locks and the technician's current B authority, then returns the stored result. It does not rerun admission, so later changes to A cannot block B. A changed proof, reason, predecessor, author or expected order version conflicts. Ordinary B writes are unchanged.

## Database boundary

New forward migration `20261021150000_diagnostic_continuity_proof_consumption`. Its DDL header came from configured `prisma migrate diff --from-schema/--to-schema`, run offline. No existing migration was edited, and nothing is backfilled.

- `diagnostic_reports."continuityProofId"` (unique) and `"reinspectionOrderVersion"` hold the persisted exact-retry binding. A CHECK makes them a pair, allowed only on reinspections. They are immutable on UPDATE. There is no FK, so retention can delete a proof without severing B.
- `diagnostic_continuity_proofs."consumedReportId"` (unique) and `"consumedAt"` form a CHECK pair.
- `diagnostic_continuity_proof_bound(proof)` holds the unchanged issuance binding predicate. Issuance, consumption and the consuming report INSERT now share it.
- The replaced `diagnostic_continuity_proof_guard` keeps the insert and invalidation rules and adds one consumption transition. That transition requires an unused, uninvalidated, unerased proof, unexpired rights, an intact binding predicate, and unchanged A version and both order epochs/evidence generations. Nothing else may change.
- The replaced `diagnostic_continuity_source_changed` invalidates only unused proofs. Its erasure deletion is unchanged.
- The replaced `diagnostic_report_pinned` lets a private reinspection INSERT through only when it names the proof consumed by this same report id, from its linking technician, at the proof's order version, with the binding predicate holding. The public equal-VIN branch is unchanged.
- No trigger was added, so `scripts/staging-clean-reset.tables.json` is unchanged. The retained-schema profile (`scripts/staging-schema.mjs`) records schema hash `d4ea6c3b…1150`, its migration inventory and migration checksum `f25d5667…a222`. The exact bytes are retained under `scripts/testing/retained-schema/`.

Not admitted: automatic VIN, mixed, corrected-identity or public-transfer proofs; concurrency acceptance; and the full ADR-0108 replacement of the temporary public path. This slice does not complete ADR-0108.

## Protected tests

No test file changed. SHA-256 at base and head:

| File | SHA-256 |
|---|---|
| `DiagnosticContinuityProofIssuance.e2e.spec.ts` (75 cases) | `d7741dd07628ef533aaa2e30af152bd673dafb45c2ea83cab3cb1f4b3d16acff` |
| `CampaignFullV3Diagnostics.e2e.spec.ts` | `80816c61234aae876b02558024b8573d718ce0efbee62b7355e69c53ed002213` |
| `identity/presentation/CampaignFullV3.e2e.spec.ts` | `780303324cd2402cd4af10bfe41cff33a1492990780fc7262727b5bd50693779` |
| `packages/db/scripts/staging-clean-reset-redis-interrupted.e2e.spec.ts` | `b6fb5f4f57841f0d9d931dec92f8bf716e80a43fb9b5806e010a0916fa727594` |
| `scripts/staging-clean-reset.test.mjs` | `ef8e6bf88235ad12903bf4f96726871075ecd6b26da3b2221fc265dc2930eacc` |
| `scripts/staging-clean-reset-remote.test.mjs` | `ec36ff80885693ebd6fc3e5eac310b2b91c732e24eb248baff54a884a346ed49` |
| `scripts/staging-clean-reset.tables.json` | `947cc7dcd8fcc1c34ae68b3af33dc6e8ef67a272659f688a9c8d1d1306846d98` |

No new test was added. The six protected RED cases already exercise this behavior through the real HTTP/PostgreSQL/storage composition. A meaningful test of trigger and lock behavior needs PostgreSQL, which belongs to the parent's hosted lane.

## Offline verification

Generation only used the synthetic `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/synthetic`; nothing connected to it.

| Command | Result |
|---|---|
| `pnpm --filter @auto-tm/db build`; `pnpm --filter @auto-tm/contracts build` | pass |
| `prisma validate`; schema-to-schema `migrate diff` equals migration DDL header | pass |
| `pnpm --filter @auto-tm/contracts openapi:generate` | pass, no `openapi.json` drift |
| `pnpm --filter @auto-tm/api typecheck` (TS7); `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | pass |
| `pnpm --filter @auto-tm/worker typecheck` | pass |
| api `eslint` on the six changed files, contracts `eslint src/schemas/diagnostics.ts`, `--max-warnings 0` | pass |
| `pnpm check:runtime-imports` | pass |
| api `pnpm test:unit` | 261 files, 2425 passed, 2 skipped |
| contracts `pnpm test:unit` | 21 files, 567 passed |
| db `pnpm test:unit` | offline 5 pass; 12 files, 119 passed |
| `pnpm test:root` (agent docs + `scripts/*.test.mjs`) | 590 pass, 1 skipped, 0 fail |
| `git diff --check` | pass |

Docs: no external lookup was needed. Only existing Prisma, PostgreSQL PL/pgSQL/SQL-function and Zod APIs already used in this repository were applied.

## Remaining gates

- Hosted API job on this exact head (parent): the six consumption cases must reach GREEN, the 69 issuance cases must stay GREEN, and the three CampaignFullV3 reset-tail failures should be confirmed as unchanged, separate failures. Migration apply, trigger behavior and both-sided invalidation under PostgreSQL are runtime-unknown until then.
- Concurrency acceptance, erasure-after-consumption acceptance, and the remaining ADR-0108 admissions are separate slices.
- Independent Standards/Spec review, assembly into #904 and deployed acceptance remain with the parent workflow.
