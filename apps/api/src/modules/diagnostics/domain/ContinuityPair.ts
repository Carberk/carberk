import { DiagnosticRuleError } from "./InspectionOrder";
export interface ContinuityVisit {
  audience: string; commissionerId: string | null; physicalAuthorized: boolean;
}
/** Audience admission stays independent from retained physical identity comparison. */
export function continuityPair(a: ContinuityVisit, b: ContinuityVisit, method: string): void {
  const privatePair = a.audience === "buyer_private" && b.audience === "buyer_private" && a.commissionerId === b.commissionerId;
  // This slice admits public comparative attestation. Automatic public ownership admission
  // remains closed until its unchanged-ownership contract has independent acceptance.
  const publicPair = a.audience === "listing_public" && b.audience === "listing_public" && method === "comparative_attestation";
  if ((!privatePair && !publicPair) || !a.commissionerId || !b.commissionerId || !a.physicalAuthorized || !b.physicalAuthorized) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
}
