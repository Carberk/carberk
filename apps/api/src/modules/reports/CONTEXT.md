# Reports

Reports measures inspection demand through InspectionInterest. Inspection intake, reports, evidence, review and PDFs belong to [Diagnostics](../diagnostics/CONTEXT.md). Content moderation reports belong to Admin.

Interest creation is gated by the inspection-interest flag and requires an eligible active listing and a non-suspended requester. The server derives buyer/seller side. Repeated requests reuse the listing/requester row and may update willingness to pay. Admin aggregate reads remain available when new interest creation is disabled.

Preserve the distinction between expressing demand and buying an inspection. Synthetic diagnostic implementation does not establish that a paid service exists today.

## Start here

- [Module composition](reports.module.ts)
- [Interest creation and tests](application/CreateInspectionInterest.ts)
- [Aggregate reads and tests](application/ListInspectionInterestStats.ts)
- [Flag/auth integration tests](presentation/reports.controller.e2e.spec.ts)
- [Schema](../../../../../packages/db/prisma/schema.prisma)
