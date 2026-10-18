import type { DiagnosticSchemas } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "./DiagnosticIntakePort";
export const DIAGNOSTIC_REPORTS_PORT = "DIAGNOSTIC_REPORTS_PORT";
export interface DiagnosticReportsPort {
  create(subject: DiagnosticSubject, orderId: string, input: DiagnosticSchemas.DiagnosticDraftCreate): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  read(subject: DiagnosticSubject, reportId: string): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  forOrder(subject: DiagnosticSubject, orderId: string): Promise<DiagnosticSchemas.DiagnosticReportRecord[]>;
  save(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticFindingSave): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  transition(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticReportTransition): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  correct(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticCorrection): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
}
