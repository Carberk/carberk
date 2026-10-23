# Moderation actor command: test-first handoff

Test-only checkpoint for #897/#901 under sole integration PR #904, implementing the evidence rows of the [moderation actor decision](full-v3-moderation-actor-decision-20261020.md) for `admin:promote`. Base `aa7ae0c8b346a25e281ee1137f1eb3ce28a5c04c`, branch `agent/issue-901-moderation-command-tests-20261020`. No source, runbook, fixture guard, v3 test, configuration, dependency or CI change. No admin promotion, database suite, Docker, staging, CI or provider action occurred.

## Test surface

[`packages/db/tests/promote-admin.command.test.ts`](../../../packages/db/tests/promote-admin.command.test.ts) runs the checked-in `scripts/promote-admin.ts` through `tsx` in a child process against a disposable Testcontainers PostgreSQL migrated with `prisma migrate deploy`, the pattern of the existing DB lifetime tests. It asserts exit code, printed User ID and state read back from the database, never a copied implementation. A per-test snapshot covers Users (role, contacts, `updatedAt`), every audit row, Sessions with `adminTotpExpiresAt`, OTP requests, TOTP enrollments, backup codes and staff grants. Audit failure is produced by a temporary `BEFORE INSERT` trigger on `audit_logs` that raises only for `ADMIN_BOOTSTRAP_PROMOTE`, dropped in `finally`.

It is discovered by the existing `vitest run` of `@auto-tm/db`, which `pnpm test:db` runs in the hosted `ci.yml` lane.

## Cases and expected result on current source

| Case | Expected now | Why |
|---|---|---|
| Phone promotes the holder; exact audit `{actorId:null, ADMIN_BOOTSTRAP_PROMOTE, user, id, {reason trimmed, before buyer, after admin}}`, no phone; bystander unchanged | GREEN | Characterizes preserved behavior |
| Phone missing/malformed refuse (exit 1); already-admin and dry-run exit 0 print the ID; nothing written | GREEN | Characterization |
| `--phone` with `--email` in either order, and neither, refuse and write nothing | **RED** | Parser ignores `--email` and promotes the phone holder |
| `--email "  Coordinator@Campaign.Example.TEST "` promotes only the trimmed/lowercased verified holder; exact contact-free audit; existing Session unchanged and unelevated; no OTP, TOTP, backup code or grant change | **RED** | No email selector |
| Email dry-run exits 0, prints the ID, writes nothing | **RED** | No email selector |
| Email already-admin exits 0, prints the ID, writes nothing | **RED** | No email selector |
| Phone selection with refused audit exits 1 and leaves role and `updatedAt` unchanged | **RED** | Role update and audit are separate writes |
| Email selection with refused audit, same expectation | GREEN, not discriminating | Passes only because email is refused today |
| Email held by no User, only by a pending sign-in OTP, or malformed exits 1; no User created | GREEN, not discriminating | Same |
| Two Users whose stored emails share a canonical form (`shared@…`, `Shared@…`) refuse for either input | GREEN, not discriminating | Same |

The non-discriminating rows become meaningful only once the email selector exists; a source change that turns the RED rows green must keep them green.

## Commands run (offline only)

From `packages/db`, with `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` (unreachable placeholder required by `prisma.config.ts`):

- `pnpm install --frozen-lockfile --offline`, `pnpm generate`, `pnpm --filter @auto-tm/contracts build`: setup
- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm exec vitest list tests/promote-admin.command.test.ts`: 10 tests collected

The suite was **not executed**. Results above are predictions from reading the source, withheld until a hosted run.

## UNKNOWN / unreached

- Actual RED/GREEN of every row: awaits the hosted `test:db` run on a batched candidate.
- Stored unverified email: unrepresentable, because `users_email_verified_check` requires `emailVerifiedAt` with `email`. The pending-OTP case is the reachable form; a source owner should still require verification explicitly.
- Suspended or deletion-scheduled email holders: the decision does not specify refusal, and the phone path accepts them today. Not asserted.
- Printed message wording, whether stdout echoes the email, and the exit code for both-selector refusal (asserted only non-zero) are left to the source owner.
- Concurrent promotion of the same User, and the v3 fixture-guard admission of the coordinator transition (decision item 5), are out of scope.

## Source-owner handoff

1. `packages/db/scripts/promote-admin.ts`: parse `--email`; refuse unless exactly one selector is present; look up the verified holder by the canonical form (`trim().toLowerCase()`, as in identity `Email` and contracts `EmailAddress`) and refuse when no holder or more than one exists (the case-sensitive unique index permits legacy collisions); run the role update and audit insert in one transaction.
2. `packages/db/src/promote-admin.ts`: generalize the selector port and validation; keep reason rules, dry-run, missing-user, already-admin and the audit `details` shape exactly; never add contact data. Update `src/promote-admin.spec.ts` for the changed port without weakening it.
3. Update runbook 86 (usage, selector rule, atomicity) with the source change, then run these tests on the hosted lane. Do not edit or weaken the assertions to obtain green.
