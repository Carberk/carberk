/** Restricted source facts, not publication authority or transport input. The adapter
 * must authenticate each fact, the immutable first anchor and transition history in
 * persisted source, under the source locks, and supply every retained raw record.
 * An observation hash, current Listing or matching raw count cannot supply this. */
export interface PublicOwnershipTuple {
  listingId: string;
  listingIdentityDigest: string;
  sellerId: string;
  commissionerId: string;
  businessId: string | null;
  membershipId: string | null;
}
export type PublicOwnershipFact =
  | ({ state: "available" } & PublicOwnershipTuple)
  | { state: "legacy_unavailable" | "erased" };
export interface PublicOwnershipVisit {
  orderId: string;
  originalRecordId: string;
  /** A's immutable original report pin; B's effective current raw selection. */
  selectedRecordId: string;
  currentRecordId: string;
  /** This is visit-local. Temporary eligibility changes are not ownership history. */
  transition: "unchanged" | "changed" | "unavailable";
  records: readonly {
    id: string; orderId: string; orderVersion: number; fact: PublicOwnershipFact;
  }[];
}

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function available(fact: PublicOwnershipFact): fact is { state: "available" } & PublicOwnershipTuple {
  return fact.state === "available" && nonempty(fact.listingId) && nonempty(fact.sellerId) && nonempty(fact.commissionerId) &&
    typeof fact.listingIdentityDigest === "string" && /^[a-f0-9]{64}$/.test(fact.listingIdentityDigest) &&
    ((fact.businessId === null && fact.membershipId === null) || (nonempty(fact.businessId) && nonempty(fact.membershipId)));
}
function equal(a: PublicOwnershipTuple, b: PublicOwnershipTuple): boolean {
  return a.listingId === b.listingId && a.listingIdentityDigest === b.listingIdentityDigest && a.sellerId === b.sellerId &&
    a.commissionerId === b.commissionerId && a.businessId === b.businessId && a.membershipId === b.membershipId;
}
function original(visit: PublicOwnershipVisit, commissionerId: string): PublicOwnershipTuple | null {
  if (!nonempty(visit.orderId) || visit.transition !== "unchanged" || !visit.records.length) return null;
  const records = [...visit.records].sort((a, b) => a.orderVersion - b.orderVersion);
  const first = records[0]; const current = records[records.length - 1];
  if (!first || !current || first.id !== visit.originalRecordId || current.id !== visit.currentRecordId || !available(first.fact)) return null;
  const ids = new Set<string>(); const versions = new Set<number>();
  for (const record of records) {
    if (!nonempty(record.id) || ids.has(record.id) || versions.has(record.orderVersion) || !Number.isSafeInteger(record.orderVersion) || record.orderVersion < 1 ||
      record.orderId !== visit.orderId || !available(record.fact) || record.fact.commissionerId !== commissionerId || !equal(first.fact, record.fact)) return null;
    ids.add(record.id); versions.add(record.orderVersion);
  }
  // The selected original report pin may be a later benign observation. Neither
  // selecting it nor reobserving may replace the visit's first ownership anchor.
  return ids.has(visit.selectedRecordId) ? first.fact : null;
}

/** Ownership is only one admission condition. VIN/evidence consistency, exactly
 * one retained structured root, current publisher authority, consent, association,
 * staff authority and unused-proof invalidation remain separate obligations. */
export function unchangedPublicOwnership(
  a: PublicOwnershipVisit | undefined, b: PublicOwnershipVisit | undefined, aCommissioner: string, bCommissioner: string,
): boolean {
  if (!a || !b || a.orderId === b.orderId || b.selectedRecordId !== b.currentRecordId) return false;
  const firstA = original(a, aCommissioner); const firstB = original(b, bCommissioner);
  return firstA !== null && firstB !== null && equal(firstA, firstB);
}
