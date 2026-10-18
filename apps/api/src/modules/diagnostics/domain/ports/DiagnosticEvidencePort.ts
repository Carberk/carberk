import type { DiagnosticSubject } from "./DiagnosticIntakePort";
export const DIAGNOSTIC_EVIDENCE_PORT = "DIAGNOSTIC_EVIDENCE_PORT";
export interface DiagnosticEvidencePort {
  upload(subject: DiagnosticSubject, input: { reportId: string; evidenceId: string; findingId: string; expectedVersion: number; mime: string; bytes: Uint8Array }): Promise<{ id: string; findingId: string; mime: string; sizeBytes: number }>;
  read(subject: DiagnosticSubject, reportId: string, evidenceId: string): Promise<{ bytes: Uint8Array; mime: string }>;
  abandon(subject: DiagnosticSubject, reportId: string, evidenceId: string): Promise<void>;
}
