# Admin

Admin owns content reports, moderation, and audit records. Identity owns authentication/elevation and User state; Listings owns listing state. Moderation coordinates through their ports rather than reimplementing ownership rules. Inspection-interest aggregates belong to Reports.

Public report creation is authenticated but does not require admin privilege. Staff read/write paths require the admin boundary. Preserve target eligibility, self-report restrictions, pending-report reuse, and message participant checks.

Report-entry and moderation-action flags disable writes independently while leaving the supported staff reads available. An off switch must not silently disable login or audit access. Moderation writes and corresponding audit records must remain consistent.

A reported Profile Photo is handled through the existing User report queue: there is no separate photo report or automated check. `RemoveUserPhoto` (`POST /api/v1/admin/users/:id/remove-photo`) releases the photo through identity's `PROFILE_PHOTO_PORT`, which `ListingsModule` provides, and commits the release, the report's resolution and a `USER_PHOTO_REMOVE` audit entry together. It does not suspend the User, who may set another photo. The admin report-detail page shows the current photo and lets an elevated admin confirm its removal; moderation actions must be enabled.

A Message report detail releases only its reported Message through Conversations' `MESSAGE_MODERATION_READ_PORT`; it never returns the saved surrounding Conversation window or attachment storage keys. Elevated staff access is audited as `REPORTED_MESSAGE_READ` with the report and Message IDs before the read, with no Message text, and fails closed if the audit cannot be stored. Deleted Messages and senders remain explicit. Read and suspension resolve the same current Message sender, using a matching saved snapshot only when the Message is missing. An unavailable sender has no suspension action. Suspension revokes the User's Sessions through Identity, resolves only the supplied pending report, and records both IDs in the same `USER_SUSPEND` transaction.

Audit and report history intentionally survives account deletion with nullable actor/reporter relationships. Reviewer-auth audit records omit credential values. A table without an update restriction does not enforce append-only history by itself; inspect the application write paths.

Admin also owns bounded marketplace Listing/User read projections behind the unchanged current-role and current-session TOTP `AdminGuard`. The projections select public/profile and moderation state explicitly and never release sign-in/contact data, private Conversations, payment evidence, staff grants or report bodies. Complaint context is a target-only count and a link to the existing separately guarded review flow. Photo URLs use released variants. Tester-gated video processing and protected grants are implemented with flags closed by default; complete buyer playback, native acceptance and rollout activation remain pending. No raw storage URL belongs in a marketplace projection.

## Start here

- [Module composition](admin.module.ts)
- [Moderation and report use-cases](application)
- [Moderation integration tests](presentation/AdminModerationController.e2e.spec.ts)
- [Adapters and audit persistence](infrastructure)
- [Admin browser boundary](../../../../admin/CONTEXT.md)
- [Inspection demand](../reports/CONTEXT.md)
- [Schema](../../../../../packages/db/prisma/schema.prisma)

The marketplace audit feed restricts its query and count to released `AdminAuditAction` actions. Purpose-private staff grant/revoke/bootstrap audit remains durable in the same table and requires a future explicitly scoped reader; marketplace role alone does not expose it or extend the legacy closed-enum response contract.
