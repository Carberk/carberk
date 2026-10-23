import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
export class IssueDiagnosticContinuityProof {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, input: D.DiagnosticContinuityProofIssuance) {
    // Separation of proof issuer and linking technician is unconditional.
    if (input.linkingTechnicianId === subject.userId) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
    return this.proofs.issue(subject, orderId, input);
  }
}
