import { z } from "../zod";

export const HistoryCapabilitySchema = z.enum(["vehicle-history", "vehicle-history-payment-evidence"]);
export const HistoryStaffLookupSchema = z.object({ targetId: z.string().guid().optional() }).strict();
export const HistoryStaffChangeSchema = z.object({
  targetId: z.string().guid(), capability: HistoryCapabilitySchema,
  active: z.boolean(), reason: z.string().trim().min(1).max(500),
}).strict();
const ActorSchema = z.object({ id: z.string().guid(), displayName: z.string().nullable(), nameNumber: z.number().int() });
export const HistoryStaffTargetSchema = ActorSchema.extend({
  eligible: z.boolean(),
  capabilities: z.object({ "vehicle-history": z.boolean(), "vehicle-history-payment-evidence": z.boolean() }),
});
export const HistoryStaffResponseSchema = z.object({ actor: ActorSchema, target: HistoryStaffTargetSchema.nullable() });
export type HistoryCapability = z.infer<typeof HistoryCapabilitySchema>;
export type HistoryStaffChange = z.infer<typeof HistoryStaffChangeSchema>;
export type HistoryStaffResponse = z.infer<typeof HistoryStaffResponseSchema>;
export type HistoryStaffTarget = z.infer<typeof HistoryStaffTargetSchema>;
