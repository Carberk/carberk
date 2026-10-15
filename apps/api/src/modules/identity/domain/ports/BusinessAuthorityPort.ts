export const BUSINESS_AUTHORITY_PORT = "IDENTITY_BUSINESS_AUTHORITY_PORT";
export interface BusinessSubject { userId: string; sessionId: string }
export type BusinessPrincipal = { kind: "personal"; userId: string } | {
  kind: "business"; userId: string; businessId: string; membershipId: string;
  role: "owner" | "sales"; status: "active" | "suspended" | "recovery";
};
export type BusinessDenial = "SESSION_REQUIRED" | "USER_INACTIVE" | "MEMBERSHIP_REQUIRED" | "BUSINESS_INACTIVE" | "OWNER_REQUIRED" | "INVITATION_INVALID" | "MEMBERSHIP_CONFLICT" | "SOLE_OWNER" | "RECOVERY_REQUIRED";
export class BusinessAuthorityDenied extends Error {
  constructor(readonly reason: BusinessDenial) { super(reason); }
}
export interface BusinessAuthorityPort {
  /** No businessId explicitly selects personal context. Never chooses by membership. */
  resolve(input: BusinessSubject & { businessId?: string }): Promise<BusinessPrincipal>;
  /** Retained history permits current members of inactive businesses, never inactive Users/members. */
  authorize(input: BusinessSubject & { businessId: string; owner?: boolean; history?: boolean }): Promise<Extract<BusinessPrincipal, { kind: "business" }>>;
}
