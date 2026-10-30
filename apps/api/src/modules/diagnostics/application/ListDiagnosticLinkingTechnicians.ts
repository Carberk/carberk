import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import type { DiagnosticDiscoveryPort } from "./ports/DiagnosticDiscoveryPort";
export class ListDiagnosticLinkingTechnicians {
  constructor(private readonly discovery: DiagnosticDiscoveryPort) {}
  execute(subject: DiagnosticSubject, orderId: string) { return this.discovery.linkingTechnicians(subject, orderId); }
}
