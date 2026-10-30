import type { DiagnosticSubject } from "./DiagnosticIntakePort";
export const DIAGNOSTIC_EVIDENCE_PORT = "DIAGNOSTIC_EVIDENCE_PORT";
/** Finding evidence stays report-owned. Storage intent, adoption and delivery each
 * reauthorize independently; a failed write/adoption retains exact cleanup metadata. */
export interface DiagnosticEvidencePort {
  upload(subject: DiagnosticSubject, input: { reportId: string; evidenceId: string; findingId: string; expectedVersion: number; mime: string; bytes: Uint8Array }): Promise<{ id: string; findingId: string; mime: string; sizeBytes: number }>;
  read(subject: DiagnosticSubject, reportId: string, evidenceId: string): Promise<{ bytes: Uint8Array; mime: string }>;
  abandon(subject: DiagnosticSubject, reportId: string, evidenceId: string): Promise<void>;
}
