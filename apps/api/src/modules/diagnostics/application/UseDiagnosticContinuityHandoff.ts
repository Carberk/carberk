import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
export class UseDiagnosticContinuityHandoff {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, proofId: string, input: D.DiagnosticContinuityCommand) {
    return this.proofs.useHandoff(subject, orderId, proofId, input);
  }
}
