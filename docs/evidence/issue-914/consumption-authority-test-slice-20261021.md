# Issue 914 private consumption authority test slice

Base: `0169758a2f1df2259c4ce236532e6a0f99e4d063` (`b08bda1a2423e577a3b17766bfb1f6f66fe22ba1`)

Head: `278b89c8` on `agent/issue-914-consumption-authority-c384f7e5`.

The appended block in `apps/api/src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts` adds ordinary HTTP/PostgreSQL acceptance coverage for:

- B-only linking-technician consumption after T's A assignment is revoked before issuance, including restricted A reads and fresh B evidence.
- Issuer grant, assignment, qualification, session, suspension and deletion loss with the issued proof and same technician JWT; real and unknown input denials are compared.
- Linking-technician B assignment, grant, qualification, session, suspension and deletion loss, including session restoration and retry.
- Permanent invalidation after reviewer A or B assignment revoke and restore, using current candidate order version.

Every denied consumption captures hidden proof state and audit rows before and after the request. It requires no new report, successor, consumed marker or consumption/creation audit, and checks generic denial text for proof, report, hash and provenance leakage. The success case checks `consumedReportId`/`consumedAt`, both audits, an empty B draft, and subsequent ordinary B evidence authoring.

The existing source prefix before the appended marker is unchanged. Prefix SHA-256: `7212eea92506dd35f053b27f40a656e4d7afee799d0ab65dfd97fe450aee38b8`. The parent’s original 75-call preservation claim therefore remains byte-for-byte intact; collection listed 33 test declarations (parameterized cases expand at execution).

Offline checks:

- Collection-only Vitest list with `/tmp/carberk-vitest-collection.mts`, no global setup or setup files: passed, 33 declarations collected.
- `pnpm --filter @auto-tm/api typecheck`: passed.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: passed.
- `pnpm --filter @auto-tm/api lint`: passed.
- `pnpm check:runtime-imports`, `pnpm check:agent-docs`, `pnpm check:glossary`, `git diff --check`: passed.
- `pnpm test:unit`: blocked by pre-existing `apps/admin` `next/navigation` resolution in `AdminApiBridge.spec.ts` (2420 passed, 5 failed); no test changes caused this failure.

Hosted PostgreSQL/migration/HTTP execution was not run. Runtime GREEN, rights-expiry exact-boundary coverage, concurrency, rollback and post-consumption lifecycle remain unverified for the parent’s hosted classification.
