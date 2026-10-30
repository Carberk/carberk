# Q3 synthetic diagnostic-center bootstrap: source handoff, 2026-10-21

Base `8f8709aae231314753a2c4fa75ee372c6a91aa51`. The source writer implemented the existing E2E contract in `packages/db/scripts/bootstrap-synthetic-diagnostic-center.ts`; the E2E spec is unchanged.

The implementation validates staging/test, the literal `DIAGNOSTIC_SYNTHETIC_ENABLED=true` flag, a strict UUID allowlist, diagnostic capability, and synthetic center code before opening PostgreSQL. One transaction uses a PostgreSQL advisory lock per center code, locks the User, grant, center and assignment, and creates only an unapproved center, a two-hour `now()` qualification, and actorless diagnostic audits. Replays require the command's bootstrap and qualification audits and keep the original deadline. Approved, foreign, revoked, expired, or unaudited state refuses without writes. The command never creates identity, sessions, TOTP, grants, elevation, templates, or operational approval.

The supplied hosted RED `DBjob119233909805` on `8f8709aa` had the verified raw-log SHA-256 `7a6ded5a220e3b94eff02c01a6a610ac5156a86613a262d0ffd36acb7037068f`: 36 files, 359/371 tests passed; the argument-shape case passed and the other 12 bootstrap cases stopped at the inert implementation error. This source handoff does not claim those deeper assertions as green.

Offline checks:

- `pnpm --filter @auto-tm/contracts build` passed.
- `pnpm --filter @auto-tm/db generate` passed with an unreachable `DATABASE_URL` value.
- `pnpm --filter @auto-tm/db exec eslint scripts/bootstrap-synthetic-diagnostic-center.ts --max-warnings 0` passed.
- `pnpm --filter @auto-tm/db exec tsc --noEmit` passed.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit` passed.
- An offline CLI invocation missing `--center-code` returned `Refused: arguments`, exit 1.
- `git diff --check` passed.

Initial compiler/lint attempts found missing generated client/contracts artifacts in the fresh worktree; the listed prerequisite build/generation resolved those failures. Import-group spacing was corrected before the passing lint run.

No Docker, local service, SQL session, Railway, credential, staging, production, CI, or hosted run was used. Runtime qualification timing, concurrency, atomic refusal/dry-run snapshots and idempotent replay still require the parent's same-test hosted GREEN. D2/D3 continuity/transfer and full-v3 preservation are outside this change.
