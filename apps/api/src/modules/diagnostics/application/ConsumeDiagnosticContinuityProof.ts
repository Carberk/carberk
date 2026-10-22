import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
/** Proof-bearing reinspection: B's linking technician consumes one pair-bound proof into B's own draft. */
export class ConsumeDiagnosticContinuityProof {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticReinspection & { proofId: string }) {
    return this.proofs.consume(subject, orderId, input);
  }
}
