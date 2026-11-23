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
export const HistoryOrderStateSchema = z.object({
  order: HistoryAcceptedOrderSchema.nullable(),
  status: z.enum(["enquiry", "awaiting_synthetic_payment", "hold_expired", "receipt_submitted", "payment_review", "payment_confirmed", "payment_received_no_hold"]),
  payment: HistoryPaymentSummarySchema.optional(),
  reportPlan: z.object({ primary: ProviderName, second: ProviderName.nullable() }).strict().optional(),
  serverNow: DateTimeSchema, wallet: z.string().regex(/^SYNTHETIC-[A-Z0-9-]{1,64}$/).nullable(), collectionEnabled: z.literal(false),
}).strict();
export type HistoryOrderState = z.infer<typeof HistoryOrderStateSchema>;
