# Full-v3 coordinator promotion source handoff

Implementation writer under #897/#901 and parent PR #904. Supplied base resolved to `ce652330f8a0ee6d3f9a769a45f901b6f8ff6095`. T3 supplied the isolated checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-ef5bd587`; scaffold `t3/ef5bd587` remains at that base. Reserved and pushed `agent/issue-901-v3-coordinator-promotion-source-20261020` before editing. This handoff and the pushed branch are this writer's durable execution record; root owns parent bookkeeping and assembly.

## Reached RED

Root supplied hosted evidence on candidate `9b2938e186d2b1eb2cbeabeaba7c585fd1d96c6f`, API run `118721265076`, `/tmp/carberk-next-release-20261020/9b2938e1/api.plain.log`, cases 2469–2492. Nineteen of twenty-two cases passed; all original seventeen passed. At b6 line 1040 the actual command exited 1 with `Synthetic identity changed`, before its audit insert. Root identified PostgreSQL lines 2704–2706 as the User UPDATE refusal. Stale candidate refusal was masked by that blanket role refusal. This writer did not rerun or independently observe that hosted execution. The independent b5 collision/setup repair remains with its test writer; no spec was edited.

## Source contract

- `packages/db/scripts/promote-admin.ts` retains the existing core command, selectors, verified-email requirement, User row locks, reason validation, dry-run, no-user refusal, role/audit transaction and already-admin no-op. It sets `autotm.admin_promote_candidate` transaction-locally from `AUTOTM_COMMIT_SHA`, with an empty value when absent. No candidate is required for ordinary Users outside the fixed campaign address grammar.
- A selected synthetic email derives exactly one hex namespace without a schema scan. Bound v3 lookup checks the roster User/email, profile, identities lifecycle and exact candidate before dry-run or no-op can return success. SQL identifiers come only from the matched 32 hex characters; User/email/candidate remain query parameters. Earlier profile versions retain their lookup behavior.
- `scripts/staging-campaign.mjs` admits only the coordinator's buyer-to-admin UPDATE, with the current candidate and no changed fields except role and `updatedAt`. Reverse and arbitrary role changes and all other aliases refuse. Subsequent ordinary coordinator User updates may retain admin. Identity creation still requires buyer.
- Lowercase `user` audit targets naming roster Users are owned by v3 tracking. The only newly accepted audit is one INSERT of `ADMIN_BOOTSTRAP_PROMOTE`, null actor, exact coordinator target, exact reason/before/after details and no extra detail fields. The User must already be journaled as admin and the transaction candidate must match. Existing reason validation remains in the real command; no contact snapshot is added.
- Two v3-only deferred constraint triggers use the same hash-bound tracking function on User UPDATE and audit INSERT/UPDATE/DELETE. At commit the coordinator admin count must equal the count of exact, live, version-one journaled promotion audits. Other roster roles remain buyers. This permits the command's role-before-audit order while rejecting an unpaired role or deleted promotion audit. Deferred checks add no journal events. Integrity checks inventory both trigger definitions, their event bits, arguments, enabled/deferred state and owning function, then check the same role/audit pairing.
- Reset uses the existing locked audit redaction and child-first disposal. V3 cleanup budgeting now counts every live journal row, including every retained audit redaction, before deletion. No new records, receipt, auth state or grants are seeded. Existing caps 128/2048, table/fence lock order, timeout/concurrency settings, queue disposal and operational entrypoint allowlists are unchanged.
- The minimal owning runbook update documents candidate-bound lookup, the deferred pairing and retained-audit reset. Identity and DB overview ownership and constraints remain accurate; no overview edit is needed.

The implementation creates no Sessions, TOTP enrollment, backup codes, capability grants or credentials. Admin role still requires normal live Session and TOTP checks and supplies no staff capability. Contact, Support, diagnostics and the remaining graph stay closed.

## Exact offline evidence

All commands below completed successfully in this owned checkout. No service, Docker, local database, integration suite, CI, Railway/provider operation, PR or child was started. Git reservation/checkpoint pushes are the authorized remote writes.

- `pnpm install --frozen-lockfile --offline`: passed, reused 2034 packages, zero downloads.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db generate`: passed. The inert loopback port-1 placeholder satisfied Prisma configuration; no database was opened.
- `pnpm --filter @auto-tm/contracts build`: passed, prerequisite generated output only.
- `pnpm --filter @auto-tm/db typecheck`: passed under TypeScript 7.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit`: passed under TypeScript 6.
- `pnpm --filter @auto-tm/db exec eslint scripts/promote-admin.ts --max-warnings 0`: passed.
- `pnpm --filter @auto-tm/db exec vitest run src/promote-admin.spec.ts`: 23/23 passed. These existing pure controls cover ordinary command behavior, not PostgreSQL trigger acceptance.
- `node --test scripts/staging-campaign.test.mjs scripts/staging-control.test.mjs`: 45/45 passed, zero skipped. Existing pure controls preserve serialized SQL checks and closed operational behavior.
- `node --check scripts/staging-campaign.mjs` and `git diff --check`: passed.
- `node /tmp/issue901-generated-comparison.mjs`: passed. Captured generated SQL and receipts for identities-v1 and business-v2, comparing against the exact supplied base for fresh fixture, existing fixture retry and reset. All six captures are byte-identical. The v3 capture contains two deferred triggers, exact candidate setting checks, lowercase audit ownership and commit pairing. Artifacts `/tmp/issue901-v3-generated.sql` and `/tmp/issue901-v3-reset-generated.sql` contain generated SQL only; none was executed. The first capture attempt needed the existing v1 four-User metadata response in its stub. Comparison then found two extra v2 parentheses; the source interpolation was corrected before the successful comparison. These are serialization checks, not behavioral PostgreSQL evidence.

Docs: no external dependency or service contract changed. This uses the existing Prisma transaction/raw-query adapter and PostgreSQL fixture-trigger mechanisms; no package or version changed.

## Handoff and unknowns

Root's next action is to assemble this checkpoint with the separate b5 test repair and run the same hosted disposable suite on the final candidate. Prediction: b6 should pass its former role UPDATE barrier, adopt the real audit and reach command commit, retry, normal TOTP authority and reset. Expected accounting remains 35 records/40 events before reset and 75 events after reset, with three retained redacted audits. b7's stale-candidate boundary should then be unmasked, and b9 should refuse at lookup during cleaning and after User disposal. These are predictions, not GREEN evidence.

PostgreSQL compilation/execution of the generated constraint triggers, atomic refusal and audit-failure rollback, all fourteen alias refusals, wrong/missing candidate including admin no-op, reverse transitions, malformed/foreign audit refusal, exact redaction/accounting, lost-response command/reset retries and ordinary HTTP TOTP/capability outcomes remain UNKNOWN until hosted readback. In particular, offline syntax checking validates JavaScript, not PL/pgSQL. Root must retain the broader negative matrix where the current prepared tests do not reach it.

After this slice, the checked-in Contact Phone case still requests unsupported campaign phone delivery and the Support case still expects campaign-aware collection admission. Neither boundary was opened here. No operational promotion or acceptance claim is made. Stop at pushed source handoff; root owns hosted GREEN, independent review and all later acceptance.
