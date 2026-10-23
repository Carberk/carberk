import { DiagnosticRuleError } from "./InspectionOrder";
import { unchangedPublicOwnership, type PublicOwnershipVisit } from "./PublicAutomaticOwnership";
export interface ContinuityVisit {
  audience: string; commissionerId: string | null; physicalAuthorized: boolean;
  /** Omitted until the persistence adapter can supply authenticated complete history. */
  ownership?: PublicOwnershipVisit;
}
/** Audience admission stays independent from retained physical identity comparison. */
export function continuityPair(a: ContinuityVisit, b: ContinuityVisit, method: string): void {
  const privatePair = a.audience === "buyer_private" && b.audience === "buyer_private" && a.commissionerId === b.commissionerId;
  // Production does not yet supply ownership facts, so automatic public admission
  // remains closed. Current mutable Listing bindings are never a substitute.
  const publicPair = a.audience === "listing_public" && b.audience === "listing_public" &&
    (method === "comparative_attestation" || (method === "automatic_normalized_vin" && !!a.commissionerId && !!b.commissionerId &&
      unchangedPublicOwnership(a.ownership, b.ownership, a.commissionerId, b.commissionerId)));
  if ((!privatePair && !publicPair) || !a.commissionerId || !b.commissionerId || !a.physicalAuthorized || !b.physicalAuthorized) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
}
