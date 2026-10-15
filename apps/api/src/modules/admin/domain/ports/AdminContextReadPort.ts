import type { AdminContextSchemas } from "@auto-tm/contracts";

/** Marketplace moderation projections only. Never releases sign-in/contact,
 * Conversation, payment, staff-grant or report-body data. */
export interface AdminContextReadPort {
  listings(query: AdminContextSchemas.AdminContextListingQuery): Promise<AdminContextSchemas.AdminContextListingPage>;
  listing(id: string): Promise<AdminContextSchemas.AdminContextListingDetail | null>;
  users(query: AdminContextSchemas.AdminContextQuery): Promise<AdminContextSchemas.AdminContextUserPage>;
  user(id: string): Promise<AdminContextSchemas.AdminContextUserDetail | null>;
}
export const ADMIN_CONTEXT_READ_PORT = Symbol("AdminContextReadPort");
