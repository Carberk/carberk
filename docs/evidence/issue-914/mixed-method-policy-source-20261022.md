# Mixed-method comparative policy source round

This isolated #914 writer starts at `9e99280b632f1740512ea1093f18dc24533f4278`, tree `b3735634dd592513d10d9f203d57c7c7942e0995`, on `agent/issue-914-mixed-policy-20261022-c3225aa2`. Root alone assembles into #897 through draft PR #904. No issue PR or integration push is authorized.

## Test-first checkpoint

Before production edits, `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts` freshly ran 25 cases: two mixed positive failures and 23 passes. Both failures are `DIAGNOSTIC_NO_ACCESS` at the existing manual-only comparative guard, source line25, rather than setup failures. Existing 14 cases and nine new negative cases passed. The negative raw VIN041/stamp999 cases already pass under the current blanket mixed refusal; that does not establish safety after admission changes.

The two positive cases use actual policy input with raw VIN041, retained stamp041 and shared chassis041 in both directions. Expected dates are literal. Negative cases cover conflicting stamps despite shared chassis, absent raw VIN/stamp, absent/different/contradictory common physical evidence, either side's expired evidence and expired comparison provenance. VIN/VIN comparative remains outside this bounded change.

RED log: `/tmp/issue-914-mixed-policy-c3225aa2/domain-red.log`, SHA-256 `e0c8580b178efc1ea51869bb3c9d39154c2eebc58dab6e597ca748d9e2321ea6`. The first attempt encountered missing compiled workspace packages. Initial DB generation also required a placeholder DATABASE_URL, then the contracts build prerequisite. Contracts and DB were built in dependency order with a nonconnecting offline placeholder; no services started. Those setup attempts are not criterion RED.

The committed [c4 hosted receipt](../issue-897/public-transfer-assembly-and-c4-hosted-receipt-20261022.md) independently establishes reached HTTP issuance403-versus-required201 for both existing mixed positives. The [fixture repair assembly](../issue-897/fixture-oracle-attempt2-assembly-20261022.md) establishes the retained fixture baseline. The prior `/tmp/issue-914-mixed-source-security-audit-20261022.md` shows why guard removal alone is unsafe. This writer will not run hosted HTTP, Railway, resets, local services or CI operations.

The host reports Codex gpt-6.1-sol at high effort and provides no in-place effort setting. Repository medium implementer guidance was inspected; no replacement agent, child or provider probe was used. The supplied already isolated worktree is the only owned checkout.
