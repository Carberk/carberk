# Full-v3 diagnostics bootstrap source handoff

Bounded source work for #901 under #897 and draft PR #904: the first owned diagnostics slice (template publication, private intake and reset). Base `ca264c50f9cb89ade76065a0b83ec29a7deb88d3`, tree `019a445f3d2dc38f6cd6244a0be870ce6fc1f150`; branch `agent/issue-901-diagnostics-bootstrap-source-20261021`, reserved and pushed at the base before edits in host checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-53f697ef`. No PR, issue, service, deployment, staging or CI mutation or read was made. `CampaignFullV3Diagnostics.e2e.spec.ts` is unchanged.

## Observed RED (raw receipt)

PR Checks run `39580237134`, API job `119155875762`, at `eb60330a`. Logs `/tmp/carberk-next-release-20261021/eb60330a-api.{raw,plain}.log`; raw SHA256 `bd576105b99116a082cfe805d7b785e017f13a8307559f8e7650eba86614e32d`.

- Plain lines 1798-1804: the ordinary template POST returned 403 `DIAGNOSTIC_NO_ACCESS`; the expected 201 fails at spec line 277. Every later assertion is UNREACHED.
- Journal hash before and after `4018ff3e9ed2f74b5e3d7686e7ea21bc`; all six empty diagnostic hashes `d751713988987e9331980363e24189ce`; `unchanged=true`.
- DiagnosticReports 13/13 PASS; identity full-v3 31/34.

## Admission

`CampaignDiagnosticAdmission` is patterned on Support admission. It derives the reservation only from the principal's stored roster email and the serving `AUTOTM_COMMIT_SHA`, refuses production, and takes sorted diagnostics `ROW EXCLUSIVE` table locks before the namespace advisory fence. It then calls the manifest-hashed `campaign_diagnostic_authority(principal, Session, center, template, order, peer, candidate)`. That function requires the live journaled roster User and its journaled live Session, and every manifest, roster, journal, event, tracking, schema, contract and binding hash. `DiagnosticAuthority.admitted` runs it only when `syntheticAllowed` is false, then still runs the ordinary business authority. Grants, OTP/TOTP, qualifications and order checks are unchanged. Reception peers are proven by transaction-local roster ownership and an owned current reception qualification, never an empty `sessionId`.

## Issuance and binding

The first admitted request for the helper-derived center, holding the locks, with a current reception-steward and no id/code/assignment/audit collision, inserts one protected binding: reservation, candidate, center, ms-truncated PostgreSQL `issued_at`, deadline exactly two hours later, and provenance `synthetic-test-only-v1`. It records the binding hash and inserts the center (`operationalApproval` null), the `diagnostics.reception` and `diagnostics.templates` qualifications ending at the deadline, and three bootstrap audits. A present binding is never renewed. A candidate, lifecycle or hash change, or expiry, closes admission. Nothing mints auth, Session, OTP, TOTP, grant, role, JWT or a UUID allowlist.

## Journal and reset

Six diagnostics tables are journaled. An INSERT-only guard admits only the exact bootstrap rows, owned synthetic templates, buyer-private requested orders, reception assignments, and exact `TEMPLATE_PUBLISHED`/`INTAKE_CREATED` audits; everything else raises. Integrity refuses untracked center or roster diagnostics. Preflight refuses foreign audit JSON and later report, evidence or PDF rows naming owned or roster ids. Reset deletes all 11 owned diagnostic rows, including the 5 diagnostic audits together before orders (FK-equivalent to the contract's split order), and does so before roster Users. It retains the control journal, terminal proof, 4 redacted audit_logs and 3 tombstones. Existing locks, bounds, caps (128 records/2048 events), mapping D and v1/v2 paths are unchanged. v3 namespaces created before this source fail the new integrity check; v3 remains operationally closed.

## Verification and unknowns

Offline: `node --check`, generator 13/13, contracts/db build, API TS7 and TS6, lint, admission refusal spec 4/4 (database-boundary outcomes only, not SQL, locking or authority proof). The diagnostics e2e specs refuse locally without PostgreSQL/Redis. Runtime GREEN, provenance, expiry behavior and complete capacity fit are UNKNOWN pending the hosted `CampaignFullV3Diagnostics` journey.
