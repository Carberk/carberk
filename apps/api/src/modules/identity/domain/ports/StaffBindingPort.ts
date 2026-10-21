/** Current participant facts for a feature-owned transaction. A participant need not
 * have the caller's Session; an acting issuer must supply its own current Session. */
export const STAFF_BINDING_PORT = "IDENTITY_STAFF_BINDING_PORT";
export interface StaffBindingSubject { userId: string; capability: string; sessionId?: string }
export interface StaffBinding { userId: string; capability: string; generation: string }
export interface StaffBindingPort {
  /** Acquire all User locks before any feature locks, then authorize and bind current facts. */
  bind(subjects: StaffBindingSubject[], transaction: unknown): Promise<StaffBinding[]>;
}
