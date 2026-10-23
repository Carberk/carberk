import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticContinuityProofsPort } from "./ports/DiagnosticContinuityProofsPort";
export class DiscoverDiagnosticContinuityHandoffs {
  constructor(private readonly proofs: DiagnosticContinuityProofsPort) {}
  execute(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery) {
    return this.proofs.handoffs(subject, orderId, query);
  }
}
