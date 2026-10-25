import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "./DiagnosticIntakePort";
export const DIAGNOSTIC_IDENTITY_EVIDENCE_PORT = "DIAGNOSTIC_IDENTITY_EVIDENCE_PORT";
/** Order-owned restricted identity evidence. The assigned technician captures; current
 * staff on that order read. No report, commissioner or public reader authority applies.
 * Storage phases commit independently. Every phase rechecks current authority,
 * retained rights and exact epoch; partial bytes remain bound to cleanup metadata. */
export interface DiagnosticIdentityEvidencePort {
  stage(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticIdentityProvenanceStage): Promise<D.DiagnosticIdentityProvenanceStaged>;
  /** `bytes` is null when the request carried no binary body; refused after authorization. */
  upload(subject: DiagnosticSubject, orderId: string, provenanceId: string, input: { expectedOrderVersion: number; mime: string; bytes: Uint8Array | null }): Promise<D.DiagnosticIdentityProvenance>;
  read(subject: DiagnosticSubject, orderId: string, provenanceId: string): Promise<{ bytes: Uint8Array; mime: string }>;
  append(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticIdentityEvidenceCapture): Promise<D.DiagnosticIdentityEvidence>;
  list(subject: DiagnosticSubject, orderId: string): Promise<D.DiagnosticIdentityEvidence[]>;
}
