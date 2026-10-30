# Issue 914 private consumption authority test slice

Base: `0169758a2f1df2259c4ce236532e6a0f99e4d063` (`b08bda1a2423e577a3b17766bfb1f6f66fe22ba1`)

Test checkpoint: `278b89c8`, followed by denial-observation and preservation verification refinements on `agent/issue-914-consumption-authority-c384f7e5`.

The appended block in `apps/api/src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts` adds ordinary HTTP/PostgreSQL acceptance coverage for:

- B-only linking-technician consumption after T's A assignment is revoked before issuance, including restricted A reads and fresh B evidence.
- Issuer grant, assignment, qualification, session, suspension and deletion loss with the issued proof and same technician JWT; real and unknown input denials are compared.
- Linking-technician B assignment, grant, qualification, session, suspension and deletion loss, including session restoration and retry.
- Permanent invalidation after reviewer A or B assignment revoke and restore, using current candidate order version.

Every denied consumption captures hidden proof state and audit rows before and after the request. It requires no new report, successor, consumed marker or consumption/creation audit, and checks generic denial text for proof, report, hash and provenance leakage. The success case checks `consumedReportId`/`consumedAt`, both audits, an empty B draft, and subsequent ordinary B evidence authoring.

Removing the appended block reconstructs the entire original file byte-for-byte, SHA-256 `d7741dd07628ef533aaa2e30af152bd673dafb45c2ea83cab3cb1f4b3d16acff`. All 27 original `it()`/`it.each()` call expressions, representing 75 expanded cases, have identical text and identical JSON-array SHA-256 `3a58c6df0b74d5fe48a6ef33a1726618862d79a40359a7e1fb9ac4b0d49495ee`. Expanded collection confirms 91 cases: original 75 plus 16 new cases. Static listing alone yields 33 declarations and is insufficient for the expanded count.

194 protected tracked paths selected by `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` are byte-identical to the base. SHA-256 of the sorted path/hash manifest is `698f1e800bb202776c02b37dbedf6027e6745daa718c84909ba26d55c161426c`. No production, schema, contract, CI, reset, guard, budget, wait or retry changes. Only the appended test block and this evidence file differ from the base.

Offline checks:

- `pnpm --filter @auto-tm/api exec vitest list --config /tmp/carberk-vitest-collection.mts --staticParse=false --json`: passed, 91 expanded cases collected. Temporary config exports `{ test: { globals: true, setupFiles: [], globalSetup: [], include: [<absolute proof spec path>] } }`. No hooks, services, credentials or migrations ran.
- `pnpm --filter @auto-tm/api typecheck`: passed.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: passed.
- `pnpm --filter @auto-tm/api lint`: passed.
- `pnpm typecheck`, `pnpm check:runtime-imports`, `pnpm test:agent-docs` (8 tests), `pnpm check:glossary`, `pnpm test:glossary` (40 tests), `git diff --check`: passed. Shared contracts/db builds passed; Prisma generation used a dummy offline URL and made no database connection.
- `pnpm test:unit`: failed on unrelated `apps/admin` `next/navigation` resolution in `AdminApiBridge.spec.ts` (2420 passed, 5 failed); this test-only diff does not modify that module. No dependency or service repair attempted. Initial compiler invocation before shared builds also failed on missing shared package output; rerun after configured builds passed. An initial collection invocation referenced a nonexistent temporary config; corrected temporary config and expanded collection passed.

Docs: no external lookup needed; no dependency/API usage changed.

Rights-expiry remains for the following lifecycle slice at the declared `2026-12-01T00:00:00.000Z` rights boundary. Both diagnostic and identity providers in this suite return the captured `now` object, while fake `Date` alone changes neither provider. A separately supported shared time seam must advance both without expiring the live Sessions/qualifications, which end `2027-01-01T00:00:00.000Z`. No TTL, session guard or provider changes were introduced.

Hosted PostgreSQL/migration/HTTP execution was not run. Every new assertion is runtime UNREACHED, including the first setup/issuance/consumption POST. No runtime root issue has been observed by this offline task. Parent must first classify migration application, triggers/locks and the original six consumption assertions on exact `0169758a`; if any first setup/consumption POST fails, downstream assertions remain unreached and the actual response is the root issue. Expected 403 envelopes follow the existing JWT-signature guard/application authority boundary, not an invented auth envelope. The Session-restore success is an acceptance assertion whose reachability is unverified. Runtime GREEN, rights-expiry exact-boundary coverage, concurrency, rollback and post-consumption lifecycle remain unverified for the parent’s hosted classification.
