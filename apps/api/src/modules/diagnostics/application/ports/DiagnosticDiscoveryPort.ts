import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSubject } from "../../domain/ports/DiagnosticIntakePort";
export const DIAGNOSTIC_DISCOVERY_PORT = "DIAGNOSTIC_DISCOVERY_PORT";
export interface DiagnosticDiscoveryPort {
  predecessors(subject: DiagnosticSubject, orderId: string, query: D.DiagnosticPredecessorQuery): Promise<D.DiagnosticPredecessorPage>;
  linkingTechnicians(subject: DiagnosticSubject, orderId: string): Promise<D.DiagnosticLinkingTechnicians>;
}
