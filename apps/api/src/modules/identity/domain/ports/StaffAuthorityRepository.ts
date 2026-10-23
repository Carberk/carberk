import type { StaffSubject } from "./StaffAuthorityPort";
export const STAFF_AUTHORITY_REPOSITORY = "IDENTITY_STAFF_AUTHORITY_REPOSITORY";
export interface StaffAuthoritySnapshot {
  userId: string; sessionUserId: string; role: string;
  suspended: boolean; deleting: boolean;
  expiresAt: Date; elevatedUntil: Date | null; capabilities: string[];
}
export interface StaffGrantChange extends StaffSubject {
  targetUserId: string; capability: string; reason: string; grant: boolean;
}
export interface StaffAuthorityRepository {
  current(input: StaffSubject, transaction?: unknown): Promise<StaffAuthoritySnapshot | null>;
  /** Rechecks authority and writes grant + durable actor/target audit atomically. */
  change(input: StaffGrantChange, now: Date): Promise<void>;
}
