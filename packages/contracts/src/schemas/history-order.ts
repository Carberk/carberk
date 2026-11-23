import { DateTimeSchema, z } from "../zod";

import { HistoryOfferSchema, HistoryPreflightSchema, HistoryQuotePreviewSchema } from "./history-offer";
import { HistoryPaymentSummarySchema } from "./history-payment";

export const AcceptedHistoryOfferSchema = HistoryOfferSchema.extend({
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/),
  preflight: HistoryPreflightSchema.options[1],
  proposal: HistoryQuotePreviewSchema,
});
export const AcceptHistoryQuoteSchema = z.object({ offer: AcceptedHistoryOfferSchema }).strict();
export type AcceptHistoryQuote = z.infer<typeof AcceptHistoryQuoteSchema>;
export const HistoryAcceptedOrderSchema = z.object({
  id: z.string().guid(), acceptedOffer: AcceptedHistoryOfferSchema,
  acceptedAt: DateTimeSchema, holdExpiresAt: DateTimeSchema, deliveryDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export type HistoryAcceptedOrder = z.infer<typeof HistoryAcceptedOrderSchema>;
const ProviderName = HistoryPreflightSchema.options[1].shape.providers.element.shape.name;
const Version = z.number().int().min(0).max(2147483647);
export const HistoryCorrectionCauseSchema = z.enum(["customer_correction", "company_error"]);
const CorrectionIntent = z.object({ attemptKey: z.string().guid(), expectedVersion: Version });
export const HistoryCorrectionMutationSchema = z.discriminatedUnion("kind", [
  CorrectionIntent.extend({ kind: z.literal("request"), vin: z.string().min(1).max(80) }).strict(),
  CorrectionIntent.extend({ kind: z.literal("accept"), offer: AcceptedHistoryOfferSchema }).strict(),
]);
export type HistoryCorrectionMutation = z.infer<typeof HistoryCorrectionMutationSchema>;
export const HistoryOperatorCorrectionMutationSchema = CorrectionIntent.extend({
  kind: z.literal("review"), expectedAssignmentVersion: Version,
  cause: HistoryCorrectionCauseSchema, format: HistoryQuotePreviewSchema.shape.format,
}).strict();
export type HistoryOperatorCorrectionMutation = z.infer<typeof HistoryOperatorCorrectionMutationSchema>;
export const HistoryAcceptedRevisionSchema = z.object({ revision: Version, offer: AcceptedHistoryOfferSchema,
  acceptedAt: DateTimeSchema, cause: HistoryCorrectionCauseSchema.nullable() }).strict();
export const HistoryCorrectionStateSchema = z.object({
  version: Version, acceptedRevision: Version,
  accepted: z.array(HistoryAcceptedRevisionSchema).min(1),
  pending: z.object({ vin: z.string().max(80), requestedAt: DateTimeSchema,
    review: z.object({ offer: HistoryOfferSchema, cause: HistoryCorrectionCauseSchema }).strict().nullable(),
  }).strict().nullable(),
  handoff: z.object({ revision: Version, recordedAt: DateTimeSchema }).strict().nullable(),
}).strict();
export type HistoryCorrectionState = z.infer<typeof HistoryCorrectionStateSchema>;
export const HistoryCorrectionActionSchema = z.object({ id: z.string().guid(), scope: z.string().regex(/^[a-f0-9]{64}$/),
  expectedAssignmentVersion: Version, mutation: HistoryOperatorCorrectionMutationSchema.optional() }).strict();
export const HistoryOrderStateSchema = z.object({
  order: HistoryAcceptedOrderSchema.nullable(),
  agreement: HistoryCorrectionStateSchema.optional(),
  status: z.enum(["enquiry", "awaiting_synthetic_payment", "hold_expired", "receipt_submitted", "payment_review", "payment_confirmed", "payment_received_no_hold"]),
  payment: HistoryPaymentSummarySchema.optional(),
  reportPlan: z.object({ primary: ProviderName, second: ProviderName.nullable() }).strict().optional(),
  serverNow: DateTimeSchema, wallet: z.string().regex(/^SYNTHETIC-[A-Z0-9-]{1,64}$/).nullable(), collectionEnabled: z.literal(false),
}).strict();
export type HistoryOrderState = z.infer<typeof HistoryOrderStateSchema>;
