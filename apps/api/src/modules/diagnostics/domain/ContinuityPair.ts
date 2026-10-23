import { DiagnosticRuleError } from "./InspectionOrder";
export interface ContinuityVisit {
  audience: string; commissionerId: string | null; physicalAuthorized: boolean;
}
/** Audience admission stays independent from retained physical identity comparison. */
export function continuityPair(a: ContinuityVisit, b: ContinuityVisit, method: string): void {
  const privatePair = a.audience === "buyer_private" && b.audience === "buyer_private" && a.commissionerId === b.commissionerId;
  // Automatic public continuity is limited to the unchanged commissioner pair. The
  // public binding layer separately proves the current Listing identity, publisher
  // authority and association for each visit; differing commissioners remain the
  // comparative-attestation path only.
  const publicPair = a.audience === "listing_public" && b.audience === "listing_public" &&
    (method === "comparative_attestation" || (method === "automatic_normalized_vin" && a.commissionerId === b.commissionerId));
  if ((!privatePair && !publicPair) || !a.commissionerId || !b.commissionerId || !a.physicalAuthorized || !b.physicalAuthorized) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
}
