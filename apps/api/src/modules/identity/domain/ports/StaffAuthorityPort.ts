export const STAFF_AUTHORITY_PORT = "IDENTITY_STAFF_AUTHORITY_PORT";
export interface StaffSubject { userId: string; sessionId: string }
export interface StaffSummary { capabilities: string[]; elevated: boolean; adminTotpExpiresAt?: string }
export interface StaffAuthorityPort {
  /** An owning transaction keeps grant/session revocation serialized with its write. */
  authorize(input: StaffSubject & { capability: string }, transaction?: unknown): Promise<void>;
  summary(input: StaffSubject): Promise<StaffSummary>;
}
export class StaffAuthorityDenied extends Error {
  constructor(readonly reason: "SESSION_REQUIRED" | "USER_INACTIVE" | "CAPABILITY_REQUIRED" | "ELEVATION_REQUIRED" | "GRANT_FORBIDDEN") { super(reason); }
}
