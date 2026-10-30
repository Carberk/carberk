# Q3 synthetic diagnostic-center bootstrap: test-only RED, 2026-10-21

Test checkpoint for #901 under #897, sole integration PR #904. Base `5255208dc6d2e4000748a62de6af19c848eaab9b`. Branch `agent/issue-901-synthetic-center-bootstrap-red-20261021`. It implements the contract in [first executable slice §4](prelaunch-reset-first-executable-slice-20261021.md#4-q3-synthetic-actors-center-and-qualifications) as clean-acceptance replacement infrastructure, not full-v3 graph work. No database write, CI dispatch, staging read or credential was involved. Existing staff grant, Session, TOTP, elevation and production gates are unchanged.

## Changed files

- `packages/db/scripts/bootstrap-synthetic-diagnostic-center.e2e.spec.ts`: 13 cases. The checked-in script runs in a child process against a Testcontainers-migrated PostgreSQL, using the `promote-admin.command.test.ts` pattern. No Prisma outcome is mocked.
- `packages/db/scripts/bootstrap-synthetic-diagnostic-center.ts`: an inert scaffold. It imports no database client. It prints `Refused: arguments` on a bad argument shape, and otherwise prints `Synthetic diagnostic center bootstrap not implemented`. Both exit 1.
- `packages/db/package.json`: adds `diagnostics:bootstrap-synthetic`.

## Proposed exact contract (asserted by the spec)

- **CLI:** `--center-code`, `--user-id`, `--capability`, optional `--dry-run`. Strict: no extra options or positional arguments.
- **Gate, checked before any database read:** `APP_ENV` must be `staging` or `test`. `DIAGNOSTIC_SYNTHETIC_ENABLED` must be exactly `true`. `DIAGNOSTIC_SYNTHETIC_USER_IDS` must be a JSON array of at most 100 UUIDs, and must exactly include `--user-id`. These are the `diagnosticRuntime` limits.
- **Identity:** the User exists, has a verified phone or email, and is neither suspended nor scheduled for deletion. It holds an unrevoked `staff_grants` row for the same capability. The capability must be in `DiagnosticCapabilitySchema`.
- **Center code:** `^synthetic-[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters. Names are exactly the v3 synthetic triple. `planCode` is `standard`. `operationalApproval` is SQL NULL.
- **Reuse:** the existing center must have the synthetic names, a NULL approval and a `CENTER_SYNTHETIC_BOOTSTRAPPED` audit with `{command}`.
- **Qualification:** `qualifiedUntil` is PostgreSQL transaction time plus 2 h. The spec bounds it between database clock readings taken before and after the run.
- **Audits:** actorless and content-free. `CENTER_SYNTHETIC_BOOTSTRAPPED {command:"diagnostics:bootstrap-synthetic"}` once per center. `CENTER_QUALIFICATION_SYNTHETIC {command, capability, userId}` once per qualification.
- **Idempotency:** a repeat or a concurrent run makes no change and keeps the deadline. Output contains `no change`.
- **Refusal output:** `Refused: <reason>`, exit 1. Reasons: `arguments | environment | disabled | allowlist | user | grant | capability | center-code | center-approved | center-conflict | qualification-revoked | qualification-expired | assignment-conflict`.
- **No collateral writes:** every refusal and dry run leaves the following identical: Users, Sessions, OTP, TOTP enrollments and backup codes, staff grants, `audit_logs`, templates, orders and all diagnostic rows. A successful run leaves the approved bystander center, its assignment and its audit identical.

## Unresolved semantics (not invented)

- **Renewal:** an expired or revoked qualification is refused. No renewal path exists. A fresh acceptance group needs a clean reset, or a later decided renewal command.
- **Assignment conflict:** an existing unrevoked assignment without this command's qualification audit is refused (proposal). An existing audited assignment with a deadline later than now+2 h is not separately tested.
- **"Ordinary" User:** the marketplace role is not restricted, matching `bootstrap-staff`.
- **No `dotenv`:** the scaffold does not load `dotenv`. The spec's absent-variable cases assume no local `.env` supplies the gate.
- **Locking:** the spec requires the concurrent outcome only. The locking method is left to GREEN.

## Authorization mapping (not claimed here)

The ordinary path is covered only with fixture-created centers:
- template publication and ordinary authority: `DiagnosticReports.e2e.spec.ts:111`;
- cross-audience refusal: `:157`, `:554`, `:571`.

Publishing through a center *created by this command* is later acceptance. It needs either S3's API hosted case (publish 201 plus cross-audience refusal) or deployed X1–X4.

## Verification

Offline: `pnpm turbo run typecheck --filter=@auto-tm/db` (with an unreachable `DATABASE_URL`) passed, ESLint on both files passed, `vitest list` collected 13, `git diff --check` and `pnpm check:agent-docs` passed. No local Docker.

Hosted RED command (db job): `pnpm test:db`, or `pnpm --filter @auto-tm/db exec vitest run scripts/bootstrap-synthetic-diagnostic-center.e2e.spec.ts` with `APP_ENV=test TESTCONTAINERS_RYUK_DISABLED=true`.

Intended RED:
- The four positive cases fail at `expect(result.code, output).toBe(0)` with `not implemented`.
- Eight refusal cases fail at `toContain("Refused: <reason>")`.
- The argument-shape case is expected GREEN on the scaffold.

Any other failure (migrate, container, ENOENT) is not a valid RED.
