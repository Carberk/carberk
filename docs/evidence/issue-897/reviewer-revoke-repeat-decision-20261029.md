# Reviewer revoke-repeat disposition

Coordinator decision, 2026-10-29. This resolves the maintenance child's reached public command failure. It is implementation direction within the accepted three-operation compatibility repair, not runtime acceptance.

## Governing behavior and reached failure

The [deployment runbook](../../prd/ops/80-deployment-runbook.md#reviewer-scenario-seed-rotation-and-revocation) defines revocation as removing reviewer login reachability while preserving historical identities and content. The [independent maintenance contract](maintenance-compatibility-contract-review-20261029.md#reviewer-contract) requires whole-roster security cleanup, protected-source eligibility, exact transaction/effect closure and real idempotency. The runbook's explicit second-run-zero sentence concerns testers. It does not independently establish reviewer repeat behavior.

The child reports a real first revoke succeeds and a second refuses because application preflight requires nonnull `emailVerifiedAt`, which the successful revoke clears. Preserve this reached RED and its literal test and logs. A successful command's exact revoked output is a recognized input for a later revoke. This removes no eligibility or authorization requirement and restores no account or contact.

## Narrow accepted behavior

- Recognize only the successful revoke tuple for an existing fixed roster slot: exact ID and slot role, `phone=revoked:<id>`, `email=null`, `emailVerifiedAt=null`, `displayName=Revoked <id>`, retained nonnull `phoneVerifiedAt`, no suspension and no deletion schedule. Other verification, role, ownership or eligibility drift still refuses. Rotation behavior remains unchanged.
- Preflight and revalidate the whole fixed roster, including existing catalog and Listing association checks. Missing slots retain their existing disposition.
- A clean already-revoked whole roster with no owned Sessions and no active devices succeeds with no account, security or audit writes and empty `revokedUserIds`.
- A mixed active/revoked roster, or an otherwise revoked roster with a new Session or active device, requires one complete prepared transaction-owning finite plan. Fresh source and effect discovery, whole-roster validation, exact cleanup and atomic rollback remain required. A tombstone alone never authorizes skipping cleanup.
- Preserve the contact-free scenario audit convention for actual changes. Preserve every original assertion and the reached repeat RED. Do not broaden the roster, permit privileged or suspended accounts, restore credentials, delete historical content, skip required coverage or change timing or closure limits.

Application preflight, adapter planning, strict SQL parsing and derived effects must agree. Required new evidence includes a real clean repeat with unchanged account/security/audit state, dirty-repeat cleanup, and whole-roster failure rollback. Authored tests and this decision are not proof that those outcomes pass.

## Handoff and scheduling

Decision sent to the existing R7g implementation child using T3 agent messaging, request `candidate-a-r7g-reviewer-repeat-decision-20261029`. Child acknowledged. No founder-facing question is required. Finish and drain the current run, preserve its checkpoint, then implement source-only. Verification follows the already queued R6c static/original-native and reset genuine-RED windows.
