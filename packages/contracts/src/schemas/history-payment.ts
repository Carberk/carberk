import { DateTimeSchema, z } from "../zod";

export const HistoryPaymentCheckInputSchema = z.object({
  attemptKey: z.string().guid(), orderId: z.string().guid(),
  expectedAssignmentVersion: z.number().int().min(1), expectedPaymentVersion: z.number().int().min(0),
  walletChecked: z.literal(true), outcome: z.enum(["matched", "partial", "unmatched", "uncertain"]),
  amountMinor: z.number().int().min(0).max(100_000_000),
  reference: z.string().trim().min(1).max(160), evidence: z.string().trim().min(1).max(1000),
  evidenceFileId: z.string().guid().nullable(), receivedAt: DateTimeSchema.nullable(),
}).strict().refine((value) => value.outcome === "matched" ? value.amountMinor >= 10000 && value.receivedAt !== null
  : value.outcome === "partial" ? value.amountMinor > 0 && value.amountMinor < 10000 && value.receivedAt !== null : true);
export type HistoryPaymentCheckInput = z.infer<typeof HistoryPaymentCheckInputSchema>;
export const HistoryPaymentCheckSchema = z.object({
  input: HistoryPaymentCheckInputSchema, actorId: z.string().guid(), version: z.number().int().min(1),
  checkedAt: DateTimeSchema, confirmedAt: DateTimeSchema.nullable(), bookingCommitted: z.boolean(),
}).strict();
export type HistoryPaymentCheck = z.infer<typeof HistoryPaymentCheckSchema>;
export const HistoryPaymentVerificationSchema = z.object({
  orderId: z.string().guid(), version: z.number().int().min(0), checks: z.array(HistoryPaymentCheckSchema),
}).strict();
export type HistoryPaymentVerification = z.infer<typeof HistoryPaymentVerificationSchema>;
export const HistoryPaymentSummarySchema = z.object({
  outcome: z.enum(["receipt_submitted", "matched", "partial", "unmatched", "uncertain"]),
  amountMinor: z.number().int().min(0), receivedAt: DateTimeSchema.nullable(), confirmedAt: DateTimeSchema.nullable(), bookingCommitted: z.boolean(),
}).strict();
