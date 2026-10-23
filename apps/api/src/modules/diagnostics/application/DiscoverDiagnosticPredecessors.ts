import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticDiscoveryPort } from "./ports/DiagnosticDiscoveryPort";
export class DiscoverDiagnosticPredecessors {
  constructor(private readonly discovery: DiagnosticDiscoveryPort) {}
  execute(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery) {
    return this.discovery.predecessors(subject, orderId, query);
  }
}
