import { z } from "zod";
/** Purpose access only; feature owners still enforce assignment/audience. */
export const StaffCapabilitySchema = z.enum([
  "support.operations", "history.fulfilment", "history.payment.verify",
  "history.payment.history", "history.export", "founder.refund.approve",
  "staff.manage", "founder.control", "founder.admission", "founder.recovery",
  "diagnostics.reception", "diagnostics.technician", "diagnostics.reviewer", "diagnostics.templates",
  "analytics.aggregate", "analytics.investigate",
]);
export type StaffCapability = z.infer<typeof StaffCapabilitySchema>;
export const StaffSummarySchema = z.object({ capabilities: z.array(StaffCapabilitySchema), elevated: z.boolean(), adminTotpExpiresAt: z.string().datetime().optional() });
export const StaffGrantChangeSchema = z.object({ targetUserId: z.string().uuid(), capability: StaffCapabilitySchema, reason: z.string().trim().min(1).max(1000), grant: z.boolean() }).strict();
export const StaffDenialReasonSchema = z.enum(["SESSION_REQUIRED", "USER_INACTIVE", "CAPABILITY_REQUIRED", "ELEVATION_REQUIRED", "GRANT_FORBIDDEN"]);
