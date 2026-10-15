import type { BusinessSubject } from "./BusinessAuthorityPort";
export const BUSINESS_AUTHORITY_REPOSITORY = "IDENTITY_BUSINESS_AUTHORITY_REPOSITORY";
export interface BusinessAuthoritySnapshot {
 userId: string; expiresAt: Date; suspended: boolean; deleting: boolean;
 membership: null | { id: string; businessId: string; role: "owner" | "sales"; active: boolean; status: "active" | "suspended" | "recovery" };
}
export interface BusinessAuthorityRepository { current(input: BusinessSubject): Promise<BusinessAuthoritySnapshot | null> }
