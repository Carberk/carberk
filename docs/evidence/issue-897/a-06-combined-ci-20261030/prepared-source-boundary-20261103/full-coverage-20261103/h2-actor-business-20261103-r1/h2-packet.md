# Issue #940 H2: lawful actors and Business graph (offline source)

Source checkpoint `cec5d51aa633d2ed84d01d0f1d93baad511e5d9d` (tree `5e9dca01ad5f2423b44d42246b4e6ca1a2edaed7`), from base `a860052d8f0896f701999eb012819b6e7e7a8442`. The base's non-documentation source equals coordinator candidate `323049c5`. Offline slot: 2026-11-03T18:20Z–20:00Z.

## Seven cases (machine-checked: `h2-case-map-and-audit.json`)

| ID | Target (row) | Lawful producer |
|---|---|---|
| F04 | ClassifiedForwardCapture.e2e (`active`) | Business graph: a founder.admission founder runs AdmitBusiness, the owner redeems, the owner runs InviteBusinessMember(commissionerB), and commissionerB redeems. Then the owner issues the ownership grant |
| F05 | ClassifiedForwardCapture.e2e (`suspended`) | Business graph, then the owner runs ChangeBusinessMembership `suspend` after arrival. No grant |
| F06 | ClassifiedForwardCapture.e2e (`missing`) | Business graph, then the owner runs ChangeBusinessMembership `remove` after arrival. No grant |
| F10 | DiagnosticContinuityHandoff.e2e (`issuer grant loss`) | A bootstrapped staff.manage actor runs ChangeStaffGrant to revoke the reviewer's `diagnostics.reviewer` grant |
| F23 | DiagnosticContinuityHandoff.e2e (`grant`) | As F10, for technicianB's `diagnostics.technician` grant, after the first consume |
| F40 | DiagnosticScopedDiscovery.e2e (`grant`) | As F23 |
| F41 | DiagnosticScopedDiscovery.e2e (`inactive`) | The `admin:promote` operator command, a repeated AdminGuard isAdmin check, then the SuspendUser use case |

- Each name equals its inventory scenario, and each ID maps to exactly one row.
- Original literals are kept, except for the fixture B version 7 and lawful ids, mapped per assertion.
- No rows are fabricated or rewritten.

## Role and grant audit

- The restricted role creation, the enforcement query and the `initialize()` permission table are byte-identical to the base.
- The only extra privileges are one task-local GRANT inside `businessMember()`, used by F04–F06 only: `SELECT,INSERT,UPDATE` on `dealerships`, `dealership_invitations` and `dealership_members`. `DROP OWNED` and `DROP ROLE` remove it at close.
- Capabilities are bootstrapped only to their own actors: founder.admission (founder) and staff.manage (staffManager). The admin role goes only to the admin actor.
- No broad role is elevated.

## Business/FK graph

See `h2-business-fk-graph.json`. Its FK relations are checked against `packages/db/prisma/schema.prisma` at the checkpoint.

## Preservation

- Changed non-doc paths are within the allow-list.
- Production, migration, SQL, config, dependency, workflow and vitest timeouts are unchanged.
- The stage1 and H1 e2e bytes are an exact prefix of each file; H2 was appended. The Readers e2e is unchanged.
- The original nine suites and the memory refusal are unchanged by hash.
- All 2374 prior evidence blobs are equal.
- F16/F17 stay OPEN and unchanged.

## Accounting

- 22 of 56 cases have e2e replacements in source: 5 stage1, 10 H1 and 7 H2. F16/F17 are still held by the parent.
- 34 cases are held: 11 stop-dependency and 23 representable but unimplemented.
- 24 e2e declarations, including 2 controls. The 168 companion cases are unchanged. A full 224 run is still not executable.

## Checks

`checks/offline-command-receipts.json`: typecheck, tsc6, lint, build and `git diff --check` ran serially against `cec5d51a`. All exited 0.

## Reviewer attention

- Capture suites use an observation-only query extension on `diagnosticOwnershipComponent.create`. It keeps the literal `not.toHaveProperty("sellerId")` assertion on its create-data subject.
- F04 needs the owner grant, because production marks a component available only with a compatible grant.
- F41 does not exercise the AdminGuard TOTP check, the route, or the `ADMIN_MODERATION_ACTIONS_ENABLED` gate. SuspendUser stamps a wall-clock `suspendedAt` and deletes the target's Sessions, which is production behavior.
- An earlier write of this packet used an unquoted shell heredoc, so the shell tried to run its backticked table words as commands. Only `suspend` was a shell builtin, and the login shell refused it. No file outside this packet changed, and this packet was rewritten.

## Unproven at runtime

- The Business, promotion, suspension and staff-revocation source commands under the restricted role.
- Whether F05/F06 observation is accepted after the membership change.
- The F23 first consume returning 201.

Tests, services and runtime were not run. Nothing here claims #940, #938, #939 or A acceptance.

Scripts (owned /tmp/issue940-h2-actor-business-r1): run.py sha256 `c2bcf5c3923088a57030b1307fab3a39148f767c892ff6a03beae79b40d6e89c`, map.py sha256 `2fbb6343182c87c363dd2e8b362f77a448a7615d26f66e3ac5d29190a71b1656`.
