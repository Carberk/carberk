import { DateTimeSchema, z } from "../zod";

import { HistoryOfferSchema, HistoryPreflightSchema, HistoryQuotePreviewSchema } from "./history-offer";

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
export const HistoryOrderStateSchema = z.object({
  order: HistoryAcceptedOrderSchema.nullable(),
  status: z.enum(["enquiry", "awaiting_synthetic_payment", "hold_expired"]),
  serverNow: DateTimeSchema, wallet: z.string().regex(/^SYNTHETIC-[A-Z0-9-]{1,64}$/).nullable(), collectionEnabled: z.literal(false),
}).strict();
export type HistoryOrderState = z.infer<typeof HistoryOrderStateSchema>;
