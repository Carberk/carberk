import { DiagnosticRuleError } from "./InspectionOrder";
export interface ContinuityVisit {
  audience: string; commissionerId: string | null; physicalAuthorized: boolean;
}
/** Audience admission stays independent from retained physical identity comparison. */
export function continuityPair(a: ContinuityVisit, b: ContinuityVisit, method: string): void {
  void method;
  if (a.audience !== "buyer_private" || b.audience !== "buyer_private" || !a.commissionerId || a.commissionerId !== b.commissionerId ||
    !a.physicalAuthorized || !b.physicalAuthorized) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
}
