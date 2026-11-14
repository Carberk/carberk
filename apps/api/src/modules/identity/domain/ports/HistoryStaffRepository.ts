import type { HistoryStaffSchemas } from "@auto-tm/contracts";
import type { StaffActor } from "./StaffAccessPort";

export interface StaffSession { userId: string; sessionId: string }
export interface HistoryStaffStore {
  findTarget(id: string): Promise<HistoryStaffSchemas.HistoryStaffTarget | null>;
  change(input: HistoryStaffSchemas.HistoryStaffChange): Promise<void>;
}
/** Locks current founder authority and keeps all work in one transaction. */
export interface HistoryStaffRepository {
  asFounder<T>(session: StaffSession, targetId: string | undefined,
    work: (store: HistoryStaffStore, actor: StaffActor) => Promise<T>): Promise<T>;
}
export const HISTORY_STAFF_REPOSITORY = Symbol("HistoryStaffRepository");
