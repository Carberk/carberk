import { z } from "zod";

/** Pending strict dictionary implementation; behavioral red checkpoint only. */
export const MeasurementEventSchema = z.unknown();
export const MeasurementBatchSchema = z.unknown();
export const EVENT_DICTIONARY = {
  listing_detail_opened: { origin: "client", purpose: "product_improvement" },
  listing_published: { origin: "server", purpose: "product_improvement" },
  first_buyer_message_accepted: { origin: "server", purpose: "product_improvement" },
  call_intent: { origin: "client", purpose: "product_improvement" },
} as const;
