# Private consumed-link lifecycle test checkpoint

TEST-ONLY #914 within selected #897, sole integration PR #904. Base `5c0fef0462712153c3c1925e91a01d6213810663`. Reserved and pushed `agent/issue-914-private-link-lifecycle` at that base before editing. Host scaffold `t3/f0e94927` remains at the base. This checkpoint adds three expanded cases to `DiagnosticContinuityProofIssuance.e2e.spec.ts`, bringing its collection from 96 to 99. No production behavior changed. Root owns assembly and classification of reached hosted results.

Read the two `/tmp/carberk-resume-20261021/` preparation outlines named in the task, repository guidance, diagnostics/report/proof sources, worker cleanup and ADR-0108. Preparation and source inspection establish no hosted outcome.

## Acceptance coverage

| Criterion | Appended test | Evidence status |
|---|---|---|
| Otherwise-current unused proof is usable immediately before A's declared end | Separate ordinary pair at `2026-10-21T12:04:59.999Z` | Collected and compiled; runtime UNREACHED |
| Exact declared end excludes consumption without partial writes | Separate ordinary pair at `2026-10-21T12:05:00.000Z` | Collected and compiled; runtime UNREACHED |
| Consumed B survives issuing reviewer's A assignment removal, with current restricted access and retry conflicts | Ordinary consumed pair, reception assignment removal, unchanged JWT retry and own finding | Collected and compiled; runtime UNREACHED |
| Worker erasure removes restricted proof, A payload and exact objects while B survives | Explicitly unimplemented, isolation blocker below | BLOCKED; no erasure claim |

The new bounded capture helper uses ordinary visit, provenance stage/upload, structured capture, release, comparison and retained-byte endpoints. It declares A evidence and provenance rights ending at exactly `12:05:00.000Z` before collecting material. B uses the original later `2026-12-01T00:00:00.000Z` rights. Reads assert both sides' exact stored rights ends and the proof's derived A boundary. The original append helper still asserts its original global rights. No SQL shortens rights, and no TTL is invented.

The before-boundary pair must consume into a fresh empty B draft with the exact consumption timestamp and both creation/consumption audits. The boundary pair must return the exact generic private/no-store 403 envelope. Unknown proof and predecessor handles must produce the same envelope. Complete report rows, proof consumption/invalidation markers and all center audits must remain unchanged, excluding partial report/pin/consumption/audit writes.

Time advances only through temporary replacement of `now` on the already injected `DIAGNOSTIC_RUNTIME` and `IDENTITY_CLOCK_PORT` test objects plus `vi.setSystemTime`. A `finally` restores both exact functions and the prior Date. Successful return also asserts restoration to initialTime. Neither original `const now`, initialTime, hooks nor any production clock changes. Existing Session and qualification expiries remain `2027-01-01`, and the existing JWT/session fixture is used without lifetime exemptions. This seam compiles but remains runtime-unproved.

The authority case consumes before removing A assignments through reception HTTP. It removes the issuing reviewer's A assignment, then the technician's A assignment, leaving both B assignments intact. Both actors must lose proof, comparison, A structured evidence, A provenance, comparative provenance, A report and PDF access under current authority. Exact retry with the unchanged B technician JWT returns the original report with no persistence changes. A real B finding write succeeds and reads back at version 1. Subsequent exact retry returns that current report. Changed proof, reason and order-version bindings each conflict without persistence changes, and an exact retry still succeeds. This covers bounded A assignment loss, not global issuer revocation or every later mutation. The finding has no attached image; fresh evidence writes, submit and finalize after authority loss are not asserted here.

## Worker erasure blocker

Inspected the full `DiagnosticArtifactWorker.cleanup()` call graph before deciding against a worker invocation. These global selections must all have exhaustive namespace ownership proven before the first mutation, independently of database-name verification:

- `expireUnattached`: verified report evidence without cleanup requested and verified at least one day earlier, unreferenced by every revision's snapshot/state findings on the same order, ordered by verified time/id, limit 100. Under order/report locks it rechecks references before updating the selected evidence id/epoch.
- `retireIdentity`: expired proofs ordered by rights end/id, limit 100, deleted immediately. Expired unerased structured evidence ordered by rights end/id, limit 100, then cleared under each order lock with a rights/erasure recheck and order generation increment.
- Expired unerased identity provenance is updated globally with **no limit**. Its rights and payload lifecycle change before cleanup selection. Staged identity provenance at least one day old with no cleanup request and no live write lease is also updated globally with no limit.
- Verified identity provenance without cleanup requested, verified at least one day earlier and unreferenced by any structured evidence on its order, ordered by verified time/id, limit 100. The order-locked recheck selects by exact provenance id and absence of attachment.
- Erased reports, reports on erased orders, or private reports with null commissioner, with any unretired PDF/evidence, ordered by id, limit 100. Every artifact/evidence row for those reports without cleanup requested is then marked for cleanup.
- Staged report evidence at least one day old, without cleanup requested or live write lease, ordered by creation/id, limit 100, followed by an exact selected-id update with lease/state recheck.
- All cleanup-requested PDFs with no live lease, ordered by cleanup completion null-first/id, limit 100. Exact epoch claims and key validation precede deletion.
- All cleanup-requested report evidence and all cleanup-requested identity provenance with neither live write nor cleanup lease, each ordered by cleanup completion null-first/id, limit 100. Exact epoch claims and exact object-key validation precede deletion. Neither selection excludes previously completed cleanup, so already removed rows/keys must also be owned.

There is no fixture namespace parameter on these selections. The current proof suite has an exact disposable-worker database guard for its narrow audit fault, but no exhaustive pre-mutation ownership guard for this entire cleanup graph, including global unbounded updates and completed cleanup intents. Offline execution cannot inspect the actual hosted worker database inventory. Therefore neither exact disposable-worker DB identity nor exhaustive candidate ownership has been established for this case. No worker was started, no private method substituted, no direct SQL erasure used, and no guard weakened. A later bounded worker case needs the exact DB check and a complete pre-mutation inventory assertion covering all predicates above, including every row affected by unbounded updates, against explicit owned order/report/evidence/provenance/proof ids and exact object keys.

Missing assertions are real worker deletion of the restricted proof, A's erased structured fields, deletion/verification of A's exact objects, retained B material, B exact retry and own writes after that erasure. Post-consumption rights-expiry access alone is also not asserted. Same-private-commissioner account purge would erase both visits, so it is not a substitute. No different-commissioner or public-transfer fixture was introduced.

## Preservation and offline checks

Removing only the inserted block before the original final suite close reconstructs all **85,443 original bytes**, SHA-256 `65c5dc920efeb070b9f99bf045536fd861916f8ade198f0c09ac9b62c9aa9daf`, exactly matching the base. Every original helper, hook and all 96 cases are included. Expanded collection independently compared a temporary adjacent byte-identical baseline spec with the candidate, without global setup, setup files or hooks. All first 96 names/order match. Compact UTF-8 JSON name-array SHA-256 `623190442dbd35f119a53a9a66b1e9c997006fc6a29b58abdfab055faa33944e`. Temporary baseline spec removed.

All 193 tracked paths matching `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` remain byte-identical to base. Sorted `path SHA256\n` manifest SHA-256 `878dcff07662425c5e1a843dd6d5ff4db2013b6db994fee3e71f47f8b0a225b7`. Only this evidence note and the appended original proof spec change. The automatic sibling spec, protected reset/CampaignFullV3 bodies, source, contracts, schema, migrations, guards, timeouts, retries and CI are untouched.

Passed checks:

- Contracts build, followed by DB build with dummy `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline`, for generation only.
- Expanded `vitest list --staticParse=false --json` using temporary baseline/candidate configs with only globals, absolute include and empty setupFiles/globalSetup. Baseline 96, candidate 99; no services/hooks executed.
- API `typecheck`, `exec tsc6 --noEmit`, `lint`, and `build`.
- Repository `pnpm typecheck`, 11 tasks, 8 cached.
- Repository `pnpm test:unit`, 10 tasks, 9 cached. API freshly ran 261 files, 2425 passed tests and 2 existing skipped tests.
- `pnpm check:runtime-imports`, `pnpm test:agent-docs`, `pnpm check:glossary`, `pnpm test:glossary`, and `git diff --check`.
- Original-byte reconstruction, expanded-name comparison and protected-path hashes.

The first unit-gate invocation lacked DATABASE_URL and stopped during the DB build. Rerunning with the dummy offline URL passed; no service connection or product repair occurred. An inspection initially requested nonexistent `apps/api/vitest.config.ts`; the actual `.mts` configuration was then read. An initial PR tool link used an incorrect repository owner; it was removed and the sole actual PR `https://github.com/Carberk/carberk/pull/904` was linked correctly.

Docs: not applicable, internal test-only change using existing HTTP/Prisma/time-fake patterns without dependency changes. No agents, local services, Docker, Railway, authentication retry, credential search, deployment, reset, CI mutation, merge, promotion or submission. All three new hosted cases remain UNREACHED; offline checks establish neither acceptance GREEN nor criterion RED. Root alone assembles and classifies hosted outcomes and authorizes a production fix only after a genuine reached unmet criterion.
