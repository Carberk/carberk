import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
/** Restricted historical proof read, independently authorized on both visits. */
export class ReadDiagnosticContinuityProof {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, proofId: string) {
    return this.proofs.read(subject, orderId, proofId);
  }
}
