# Bounded private automatic VIN proof source checkpoint

Issue #914 within #897, sole integration PR #904. Hosted GREEN is **UNVERIFIED**. This checkpoint implements a conservative automatic subset of ADR-0108; it does not complete that decision or authorize release, staging, promotion or submission.

## Authority and reached RED

Writer base `5361851d704c78658b7c9db11900372a73b4b345`. Fresh linked worktree `/tmp/carberk-914-auto-vin-green-20261022-native`, reserved branch `agent/issue-914-automatic-vin-source-20261022-native`, pushed at base before edits. Root is sole assembler and owns hosted execution and final independent review. No other checkout was changed.

Root supplied reached hosted RED on exact base: PR Checks `39707551506`, API job `119591093447`, raw `/tmp/carberk-resume-20261021/5361851d-api-119591093447.raw.log`, SHA-256 `238fb58b9b79c60e4b825182732356278d93b58bf70536112badeab6fcb5cf17`. Its ANSI-free derivative ends in `.plain.log`. The automatic positive reached line 261 and received 400 `DIAGNOSTIC_INVALID_INPUT` against required 201, after ordinary two-private-visit setup, whitespace/case VIN capture, independent structured evidence, A release, restricted comparison and both actual provenance byte downloads. Subsequent automatic proof/read/consumption assertions were unreached. Root classified all 99 comparative cases, worker 373/373 and DB 392/392 as passing; API had automatic plus three unchanged reset-tail failures. These are supplied base results, not writer-executed or candidate GREEN.

Offline test-first checkpoint `2746a1a694a9bc43c4f3fa72a2bb4538e08448de` was committed and pushed before source. `pnpm --filter @auto-tm/contracts exec vitest run src/schemas/diagnostics-automatic-vin.spec.ts` failed both new tests because the actual issuance/read schemas rejected the automatic method. `pnpm --filter @auto-tm/api exec vitest run --config /tmp/issue914-unit.config.mts` failed the eligible VIN case with the existing `DIAGNOSTIC_NO_ACCESS`, 11 remaining cases passed. That temporary config selected the existing domain spec with no global setup/setup files or external services. These were actual unmet-criterion failures, not import/setup failures.

Source checkpoint `74bf1e93c8371da3fdf2fc6a3d29571c20645491`, tree `e19b531fb6fed428d629357e06adb006fc7ab6ea`, was committed and pushed before this note.

## Implemented boundary

The existing strict issuance and read shapes admit the additional literal method `automatic_normalized_vin`. They still require rationale and the full provenance union, record the actual issuer/time and retain every existing pair binding. Manual `comparative_attestation` keeps its prior rules. No technician, self or background issuance authority was added.

The proof owner keeps current distinct qualified reviewer authority independently assigned on both orders, B's current linking technician, current User/Session/grants, synthetic buyer-private admission, same nonnull commissioner, retained finalized/withdrawn A with no successor, and arrived physically authorized B without a first report. Private pairs require no common Listing. All existing participant/order/evidence/provenance/staff locks and post-lock rereads remain. No public admission or fallback was expanded.

Method-specific domain policy requires both observations to use VIN, with equal nonempty trimmed uppercase VINs, independently retained consistent VIN stamps, and no contradictory chassis/manufacturer-plate identifiers. It checks the current order observations and every retained raw observation for unchanged VIN identity. A different historical method/VIN, erased or unavailable history refuses even if the final VIN is restored. Date and mileage differences alone remain admissible.

The bounded subset requires exactly one retained structured root per visit, selecting that root, and refuses any other root or correction chain rather than ignoring its material. Root explicitly accepted this subset. Multiple-root eligibility and broader automatic issuer eligibility remain open. Mixed methods, corrected identity, different/null private commissioner, mixed/private-public/public pairs and public transfers remain outside this slice.

Retention still ends at the shortest declared evidence/provenance right. Existing evidence resolution refuses missing, foreign, staged, expired, erased or hash-inconsistent provenance; issuance still checks the exact complete union. Automatic consumption rechecks method-specific identity and the same rights end alongside every existing binding. Permanent unused-proof invalidation, atomic consume plus empty B report plus two audits, exact retry bindings and surviving-link semantics are unchanged. A findings/evidence are never copied to B.

Forward migration `20261021160000_diagnostic_automatic_vin_proof` replaces only the effective `diagnostic_continuity_proof_guard` method-admission predicate with the closed two-method set. Its remaining body exactly matches the effective consumption migration. No columns, historical SQL/checksum edits, data rewrite, backfill, new TTL or rights were introduced. A Prisma model comment gives this new migration inventory a distinct schema hash without changing storage. Reviewed registration and retained SQL mirror accompany it; the prior schema hash and inventory are preserved. Rollback requires a later forward migration closing automatic issuance, never clearing consumption or reviving invalidation.

## Verification

| Criterion | Evidence | Result |
|---|---|---|
| Automatic strict input/output with complete bindings | New contract tests, existing contracts suite | PASS offline |
| Eligible normalized VIN, shortest rights, unchanged recapture dates/mileage | Existing domain owner with new method tests | PASS offline |
| Wrong/missing/unequal observed VIN, unsupported/mismatched stamps, contradictory chassis/plates, corrected or changed raw history, additional roots, expiry | Domain refusal tests | PASS offline |
| Original 99 comparative cases and automatic positive preserved | Exact byte comparison and expanded collection | PASS preservation only |
| Actual automatic issuance/read/consumption and method-specific HTTP refusals | Original positive plus hosted acceptance needed | UNVERIFIED candidate |
| Existing authority/atomicity/lifecycle and SQL trigger runtime regressions | Hosted API/DB candidate gates needed | UNVERIFIED candidate |

Commands completed on source checkpoint inputs:

- `pnpm --filter @auto-tm/api exec vitest run --config /tmp/issue914-unit.config.mts`: PASS, 14 domain tests, no service setup.
- `pnpm --filter @auto-tm/contracts test`: PASS, 22 files, 569 tests. `pnpm --filter @auto-tm/contracts typecheck`, `pnpm --filter @auto-tm/contracts exec tsc6 --noEmit`, `pnpm --filter @auto-tm/contracts lint`, `pnpm --filter @auto-tm/contracts build`: PASS.
- `pnpm --filter @auto-tm/api typecheck`, `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, `pnpm --filter @auto-tm/api lint`, `pnpm --filter @auto-tm/api build`: PASS. Initial exact-optional type and import-order lint findings were repaired before the final passes.
- `pnpm --filter @auto-tm/contracts openapi:generate`: PASS, tracked `openapi.json` unchanged.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: PASS. After the schema comment changed, `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm exec turbo run build --filter=@auto-tm/db`: PASS, two tasks, one cached. The inert URL was used only for generation/build; no connection was attempted.
- `pnpm --filter @auto-tm/db lint`, `pnpm --filter @auto-tm/db exec tsc6 --noEmit`: PASS.
- `node --test scripts/*schema*.test.mjs`: PASS, 17 tests. New check verifies exact registered migration/mirror bytes and the unchanged effective guard body except method admission. It does not execute SQL.
- `pnpm test:unit`: first attempt stopped at uncached DB generation with missing `DATABASE_URL`. Existing store dependencies were hydrated with `pnpm --filter @auto-tm/admin --filter @auto-tm/web --filter @auto-tm/mobile --filter @auto-tm/worker exec node -p 'process.cwd()'`. The generation-only Turbo command above populated the DB build cache. The unchanged root command then PASS, 10 tasks, 3 cached. Fresh API result: 261 files, 2,433 passed and two existing skips. Fresh mobile 3,806, admin 330, web 184, worker 292, DB unit 119, contracts 569. No e2e tests run and no services started. Logs `/tmp/issue914-green-unit.log` and `/tmp/issue914-green-unit-retry.log` retain the distinction.
- `pnpm typecheck`: initial attempt stopped at missing DB generation URL and unhydrated admin dependencies. After the same preparation, PASS, 11 tasks, 5 cached. Logs `/tmp/issue914-green-typecheck.log` and `/tmp/issue914-green-typecheck-retry.log`.
- `pnpm test:agent-docs`: PASS, eight tests. `pnpm check:runtime-imports`: PASS, db/contracts. `pnpm check:glossary`: PASS, 31 terms. `pnpm test:glossary`: PASS, 40 tests. `git diff --check`: PASS. Agent-docs and diff checks run again after this note.

Docs: no external dependency/service/API change, no documentation lookup needed. Existing configured Nest/Prisma/Zod boundaries are retained. Diagnostics CONTEXT now states the bounded automatic source behavior and pending runtime verification, including the open multiple-root and issuer boundaries.

## Preservation

`python3 /tmp/issue914-green-preservation.py` compared exact base bytes and recorded `/tmp/issue914-green-preservation.json`:

- `DiagnosticContinuityProofIssuance.e2e.spec.ts`: 93,759 bytes, SHA-256 `661fe7c95570abf057ce537db0b2c7557fc2a8982c77d6605603b90b5f237ada`, 99 expanded cases. Compact UTF-8 JSON name-array SHA-256 `12084649b3e69fd416270d7aae0642c00eb4cf98025702aab688c986be5db1f5`.
- `DiagnosticAutomaticVinProof.e2e.spec.ts`: 22,337 bytes, SHA-256 `3dded313c56a8507d3af07bfc90d84471c7ed3079cc83df2af8899f17fbdc472`, one unchanged expected-201 case. Name-array SHA-256 `728d024b62674c3f0b73856bfd758be6c4a6892f1dff22b0854cbf0123b30ccf`.
- All 134 base paths matching case-insensitive `CampaignFullV3|reset|guard|budget|/migrations/|^\.github/` remain byte-identical. Sorted `path SHA256\n` manifest SHA-256 `ad136ce40f41a011746eb2fa08350d264b1bbc29b30f754345861c1abb1b9f05`. New migration paths are additions. Intended schema-comment/contract/registry changes are recorded above.
- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue914-proof-collection.config.mts --staticParse=false --json`: PASS, exactly 100 expanded names, saved `/tmp/issue914-green-collection.json`. The temporary config includes only the two original HTTP specs with no global setup/setup files. It collects without executing their setup or requests.

No local Docker/services, Railway access, credentials discovery, CI execution/mutation, staging reservation/mutation, deploy/reset, merge, promotion or store action occurred. Three terminal Railway refusals remain in force. No host guard refused this writer. No subagents or T3 delegation were used. The pushed checkpoint awaits root assembly, fresh independent review and fresh hosted API/DB evidence. Preserve this worktree until the lifecycle cleanup gate permits retirement.
