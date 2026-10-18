import { Inject, Injectable } from "@nestjs/common";
import type { DiagnosticSchemas } from "@auto-tm/contracts";
import type { Prisma } from "@auto-tm/db";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DiagnosticAuthority } from "./DiagnosticAuthority";
@Injectable()
export class DiagnosticReportAccess {
  constructor(@Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority) {}
  async load(tx: Prisma.TransactionClient, subject: DiagnosticSubject, id: string, capability?: DiagnosticSchemas.DiagnosticCapability) {
    const found = await tx.diagnosticReportRecord.findUnique({ where: { id } });
    if (!found) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    const scope = await this.authority.order(tx, subject, found.orderId, capability);
    await tx.$queryRaw`SELECT id FROM diagnostic_reports WHERE id=${id} FOR UPDATE`;
    const row = await tx.diagnosticReportRecord.findUnique({ where: { id } });
    if (!row || row.erasedAt || (!scope.staff && !row.snapshot)) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    return { row, order: scope.row, staff: scope.staff };
  }
}
