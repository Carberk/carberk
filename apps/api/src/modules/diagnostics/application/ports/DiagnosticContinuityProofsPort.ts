import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../../domain/ports/DiagnosticIntakePort";
export const DIAGNOSTIC_CONTINUITY_PROOFS_PORT = "DIAGNOSTIC_CONTINUITY_PROOFS_PORT";
/** Issuance locks, authorizes and persists one proof/audit atomically. A handle is not read
 * authority; only B's current linking technician may consume an unused proof, once. */
export interface DiagnosticContinuityProofsPort {
  issue(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance): Promise<{ proofId: string }>;
  read(subject: DiagnosticSubject, orderId: string, proofId: string): Promise<D.DiagnosticContinuityProof>;
  /** Consumes the proof, creates B's linked empty draft and audits atomically; exact retries return that report. */
  consume(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticReinspection & { proofId: string }): Promise<D.DiagnosticReportRecord>;
}
