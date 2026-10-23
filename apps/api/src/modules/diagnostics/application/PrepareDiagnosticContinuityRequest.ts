import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
export class PrepareDiagnosticContinuityRequest {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityRequestPrepare) {
    return this.proofs.prepareRequest(subject, orderId, input);
  }
}
