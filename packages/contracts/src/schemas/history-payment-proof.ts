import { DateTimeSchema, z } from "../zod";

export const MAX_PAYMENT_PROOF_BYTES = 8 * 1024 * 1024;
export const PaymentProofContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const StagePaymentProofSchema = z.object({
  orderId: z.string().guid(), attemptKey: z.string().guid(), contentType: PaymentProofContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(MAX_PAYMENT_PROOF_BYTES),
}).strict();
export type StagePaymentProof = z.infer<typeof StagePaymentProofSchema>;
export const PaymentProofSchema = z.object({
  id: z.string().guid(), orderId: z.string().guid(), purpose: z.literal("payment_evidence"),
  contentType: PaymentProofContentTypeSchema, sizeBytes: z.number().int().min(1).max(MAX_PAYMENT_PROOF_BYTES),
  status: z.enum(["pending", "uploaded", "submitted", "deleted"]), createdAt: DateTimeSchema,
  expiresAt: DateTimeSchema, submittedAt: DateTimeSchema.nullable(),
}).strict();
export type PaymentProof = z.infer<typeof PaymentProofSchema>;
export const PaymentProofsSchema = z.object({ items: z.array(PaymentProofSchema).max(10) }).strict();
export const SubmitPaymentProofSchema = z.object({ orderId: z.string().guid() }).strict();
export const ReadPaymentProofSchema = z.object({ file: PaymentProofSchema,
  dataBase64: z.string().min(1).max(Math.ceil(MAX_PAYMENT_PROOF_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/),
}).strict();
export const HistoricalPaymentEvidenceSchema = z.object({
  requestId: z.string().guid(), fileId: z.string().guid(), purpose: z.literal("payment_evidence"),
  reason: z.string().trim().min(10).max(500),
}).strict();
export type HistoricalPaymentEvidence = z.infer<typeof HistoricalPaymentEvidenceSchema>;
