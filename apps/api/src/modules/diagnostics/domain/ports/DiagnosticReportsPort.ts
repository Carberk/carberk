import type { DiagnosticSchemas } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "./DiagnosticIntakePort";
export const DIAGNOSTIC_REPORTS_PORT = "DIAGNOSTIC_REPORTS_PORT";
/** Restricted comparison only. Ordinary report readers never receive these bindings. */
export interface DiagnosticReinspectionComparison {
  predecessor: { reportId: string; reportVersion: number; snapshotHash: string; identityRecordId: string; identityRecordHash: string; identity: DiagnosticSchemas.DiagnosticIdentityRecord["observation"] };
  candidate: { orderId: string; orderVersion: number; identityRecordId: string; identityRecordHash: string; identity: DiagnosticSchemas.DiagnosticIdentityRecord["observation"] };
}
export interface DiagnosticReportsPort {
  comparison(subject: DiagnosticSubject, orderId: string, predecessorId: string): Promise<DiagnosticReinspectionComparison>;
  create(subject: DiagnosticSubject, orderId: string, input: DiagnosticSchemas.DiagnosticDraftCreate): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  read(subject: DiagnosticSubject, reportId: string): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  forOrder(subject: DiagnosticSubject, orderId: string): Promise<DiagnosticSchemas.DiagnosticReportRecord[]>;
  save(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticFindingSave): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  transition(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticReportTransition): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  correct(subject: DiagnosticSubject, reportId: string, input: DiagnosticSchemas.DiagnosticCorrection): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
  /** `orderId` is the new visit. No predecessor read authority is granted. */
  reinspect(subject: DiagnosticSubject, orderId: string, input: DiagnosticSchemas.DiagnosticReinspection): Promise<DiagnosticSchemas.DiagnosticReportRecord>;
}
