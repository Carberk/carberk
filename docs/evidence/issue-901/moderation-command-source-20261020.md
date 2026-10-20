# Moderation command source handoff

Bounded source checkpoint for #897/#901, integration PR #904. Resumed from `794ac50a41836472ad0278f95f03d1e07ef80e43` on reserved branch `agent/issue-901-moderation-command-source-20261020`. The failed prior writer was terminal per dispatch. This writer used its host-created checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-67e58930`, fetched the canonical branch and detached there. The two stopped source files were inspected read-only in `t3-7ed75466`; they matched the original implementation. No writes or git commands targeted that checkout.

## Source changes

- `packages/db/src/promote-admin.ts` requires exactly one phone/email selector and preserves phone validation, trimmed nonempty reason with a 1000-character cap and internal line breaks, missing-user refusal, dry-run and already-admin no-op. Email validation uses the existing contracts `AuthSchemas.EmailAddress`, with trim/lowercase canonicalization and no provider rewriting. It requires exactly one holder and explicit `emailVerifiedAt`, including refusal when a second holder is unverified.
- `packages/db/scripts/promote-admin.ts` parses both selectors, rejects conflicting/missing/duplicate selectors and missing values, and composes the core inside one Prisma interactive transaction. Parameterized lookup locks the selected User with `FOR UPDATE` before reading its role. Canonical stored-email lookup includes legacy case and ECMAScript trim-whitespace variants and stops at two holders, enough to refuse ambiguity. Deterministic ID ordering avoids inconsistent lock ordering among email invocations. Phone and email invocations on the same User share the row lock. A waiter sees the committed admin role and performs the existing no-op, preserving the first before-role and preventing duplicate promotion receipts. Audit failure rejects the transaction, rolling back role and `updatedAt`. No retry loop, timeout override or new dependency was added.
- The audit remains exactly null actor, `ADMIN_BOOTSTRAP_PROMOTE`, `user`, selected User ID, trimmed reason, before-role and after-role. No contact snapshots or auth state are written. Successful output identifies the User ID without echoing the selected contact.
- `packages/db/src/promote-admin.spec.ts` adapts the existing database boundary mock to the transactional port and extends public-interface outcomes for email normalization, invalid selectors, malformed/missing/unverified/ambiguous email, dry-run, already-admin, exact audit and propagation of audit failure for both selectors. It does not simulate PostgreSQL rollback or claim to prove locking.
- Runbook 86 documents selector rules, atomicity, concurrent no-op and operational limits. `packages/db/CONTEXT.md` records the remaining v3 guard limitation. All ten existing `tests/promote-admin.command.test.ts` cases are unchanged.

## Evidence

Test-first RED was supplied by hosted run `39439071650`, DB job `118683953684`, at the exact base above. `/tmp/carberk-next-release-20261020/794ac50a-db-118683953684.plain.log`, lines 531-546 and 619-718, records 5/10 command tests passing: both selectors wrongly promoted by phone, email promotion/dry-run/already-admin failed, and refused phone audit left role and `updatedAt` changed. Existing 326 DB tests and five offline tests passed there. Those results describe the base, not this checkpoint.

Offline setup in this owned checkout:

- `pnpm install --frozen-lockfile --offline`: passed, no lockfile change.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db generate`: passed, ignored client generated only.
- `pnpm --filter @auto-tm/contracts build`: passed.

Affected verification after the source changes:

- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db exec vitest run src/promote-admin.spec.ts`: 23/23 passed.
- `pnpm --filter @auto-tm/db typecheck`: passed with TypeScript 7.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit`: passed with TypeScript 6.
- `pnpm --filter @auto-tm/db lint`: passed.
- `git diff --check`: passed. Changed-file review confirms only the six assigned source/test/doc files, with no command-test edits.

Docs: no external lookup needed. The transaction and parameterized row-lock pattern already exists in `scripts/bootstrap-staff.ts`; contracts own email validation. No schema, dependency, configuration or package export changes.

## Assembly handoff and open gates

This is source-only delivery. The assembly owner must incorporate the pushed checkpoint and obtain hosted disposable PostgreSQL command-test GREEN, including actual audit-failure rollback, plus independent Standards/Spec review. Actual concurrent command invocation has not been executed; row-lock behavior is source-reviewed only and remains a runtime evidence gap for assembly.

The v3 coordinator transition/receipt guard, retained-audit disposal, reservation/current-candidate guards, ordinary sign-in/TOTP, deployed/native moderation and protected-video acceptance, and full release gates remain open. No operational promotion, service/Docker/integration/CI run, GitHub content update, PR creation, staging/provider action or nested agent was performed. No operational authorization follows from this checkpoint.
