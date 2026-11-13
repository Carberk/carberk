export const STAFF_ACCESS_PORT = Symbol("StaffAccessPort");

export interface StaffActor {
  id: string;
  displayName: string | null;
  nameNumber: number;
}

/** Current session, TOTP, account lifecycle and explicit purpose grant in one read.
 * Carries no Sign-in Methods, marketplace role or private staff metadata.
 */
export interface StaffAccessPort {
  /** Matching active session/grant, before TOTP enrollment or verification. */
  findEligibleActor(input: {
    userId: string;
    sessionId: string;
    purpose: "vehicle-history";
  }): Promise<StaffActor | null>;
  findCurrentActor(input: {
    userId: string;
    sessionId: string;
    purpose: "vehicle-history";
  }): Promise<StaffActor | null>;
}
