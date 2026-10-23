import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
export class ExecuteDiagnosticContinuityRequest {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, requestId: string, input: D.DiagnosticContinuityRequestExecute) {
    return this.proofs.executeRequest(subject, orderId, requestId, input);
  }
}
