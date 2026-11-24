import type { StaffPurpose } from "./StaffAccessPort";

export const MESSAGE_AUTHORITY_FENCE_PORT = Symbol("MessageAuthorityFencePort");
/** Retains identity lifecycle/session/exact-grant rows through a service message
 * operation. A lock grants no access: revalidate current authority inside work,
 * after all lock waits. No database client crosses this boundary. */
export interface MessageAuthorityFencePort {
  withSession<T>(input: { userId: string; sessionId: string; purpose: StaffPurpose | null; recipientId?: string; requesterId?: string },
    work: () => Promise<T>): Promise<T>;
  withUserLifecycle<T>(userId: string, work: () => Promise<T>): Promise<T>;
}
