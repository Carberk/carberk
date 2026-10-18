import { z } from "zod";

const id = z.string().uuid();
const durationMs = z.number().int().min(0).max(86_400_000);
const result = z.enum(["success", "expected_rejection", "technical_failure", "cancelled"]);
const failureCategory = z.enum(["validation", "permission", "network", "timeout", "capacity", "unsupported", "unavailable", "unknown"]);
const step = z.enum(["vehicle", "specs", "photos", "price", "location", "contact", "review"]);
const screen = z.enum(["home", "search", "results", "listing_detail", "sell", "messages", "conversation", "account"]);
const media = { attemptId: id, kind: z.enum(["photo", "video"]), result, durationMs, category: failureCategory.optional() };
const outcome = { attemptId: id, result, durationMs, category: failureCategory.optional() };
const product = { purpose: z.literal("product_improvement") };
const reliability = { purpose: z.literal("product_reliability") };

export const MeasurementContextSchema = z.object({
  platform: z.enum(["android", "ios", "web", "admin", "server"]),
  release: z.string().regex(/^[0-9A-Za-z._-]{1,64}$/),
  build: z.string().regex(/^[0-9A-Za-z._-]{1,64}$/),
  locale: z.enum(["tk", "ru", "en"]),
  connection: z.enum(["wifi", "cellular", "ethernet", "offline", "unknown"]).optional(),
}).strict();

const envelope = {
  version: z.literal(1), eventId: id, occurredAt: z.string().datetime(), visitId: id.optional(),
  context: MeasurementContextSchema,
};
const filters = z.object({
  brandId: id.optional(), modelId: id.optional(), cityId: id.optional(),
  priceBand: z.enum(["under_5000", "5000_14999", "15000_29999", "30000_plus"]).optional(),
  condition: z.enum(["new", "used"]).optional(),
}).strict();

/** No account, role, environment, population, credential or raw content is client-supplied. */
export const MeasurementEventSchema = z.discriminatedUnion("eventName", [
  z.object({ ...envelope, ...product, eventName: z.literal("visit_started"), payload: z.object({ screen }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("foreground_activity"), payload: z.object({ screen, action: z.enum(["open", "search", "filter", "favorite", "contact", "edit", "publish"]) }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("discovery_opened"), payload: z.object({ screen: z.enum(["home", "search", "results"]) }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("search_completed"), payload: z.object({ resultCount: z.enum(["zero", "1_5", "6_20", "21_plus"]), filters }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("listing_detail_opened"), payload: z.object({ listingId: id }).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("sign_in_started"), payload: z.object({ attemptId: id, method: z.enum(["phone", "email"]) }).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("sign_in_transport_result"), payload: z.object({ attemptId: id, result: z.enum(["unconfirmed_failure", "cancelled"]), category: z.enum(["network", "timeout", "unavailable"]), durationMs }).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("sign_in_result"), payload: z.object(outcome).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("draft_started"), payload: z.object({ draftId: id }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("wizard_step_opened"), payload: z.object({ draftId: id, step }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("wizard_step_result"), payload: z.object({ draftId: id, step, ...outcome }).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("media_preparation_result"), payload: z.object(media).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("media_upload_result"), payload: z.object(media).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("listing_published"), payload: z.object({ listingId: id, cityId: id, draftId: id.optional() }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("listing_visibility_changed"), payload: z.object({ listingId: id, visibility: z.enum(["public", "hidden"]), reason: z.enum(["published", "sold", "archived", "deleted", "moderated", "restored", "business_suspended"]) }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("call_intent"), payload: z.object({ listingId: id }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("conversation_created"), payload: z.object({ conversationId: id, listingId: id }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("first_buyer_message_accepted"), payload: z.object({ conversationId: id, listingId: id, messageId: id }).strict() }).strict(),
  z.object({ ...envelope, ...product, eventName: z.literal("seller_first_reply"), payload: z.object({ conversationId: id, listingId: id, firstBuyerMessageId: id, replyMessageId: id, elapsedMs: durationMs }).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("video_processing_result"), payload: z.object({ listingId: id, jobId: id, ...outcome }).strict() }).strict(),
  z.object({ ...envelope, ...reliability, eventName: z.literal("video_playback_result"), payload: z.object({ listingId: id, playbackId: id, ...outcome }).strict() }).strict(),
]);
export type MeasurementEvent = z.infer<typeof MeasurementEventSchema>;
export type MeasurementPurpose = MeasurementEvent["purpose"];
export type MeasurementEventName = MeasurementEvent["eventName"];
export type MeasurementOrigin = "client" | "server";
export const EVENT_DICTIONARY = {
  visit_started: { origin: "client", purpose: "product_improvement" },
  foreground_activity: { origin: "client", purpose: "product_improvement" },
  discovery_opened: { origin: "client", purpose: "product_improvement" },
  search_completed: { origin: "client", purpose: "product_improvement" },
  listing_detail_opened: { origin: "client", purpose: "product_improvement" },
  sign_in_started: { origin: "client", purpose: "product_reliability" },
  sign_in_transport_result: { origin: "client", purpose: "product_reliability" },
  sign_in_result: { origin: "server", purpose: "product_reliability" },
  draft_started: { origin: "client", purpose: "product_improvement" },
  wizard_step_opened: { origin: "client", purpose: "product_improvement" },
  wizard_step_result: { origin: "client", purpose: "product_improvement" },
  media_preparation_result: { origin: "client", purpose: "product_reliability" },
  media_upload_result: { origin: "client", purpose: "product_reliability" },
  listing_published: { origin: "server", purpose: "product_improvement" },
  listing_visibility_changed: { origin: "server", purpose: "product_improvement" },
  call_intent: { origin: "client", purpose: "product_improvement" },
  conversation_created: { origin: "server", purpose: "product_improvement" },
  first_buyer_message_accepted: { origin: "server", purpose: "product_improvement" },
  seller_first_reply: { origin: "server", purpose: "product_improvement" },
  video_processing_result: { origin: "server", purpose: "product_reliability" },
  video_playback_result: { origin: "client", purpose: "product_reliability" },
} as const satisfies Record<MeasurementEventName, { origin: MeasurementOrigin; purpose: MeasurementPurpose }>;

export const MeasurementBatchSchema = z.object({ events: z.array(MeasurementEventSchema).min(1).max(50) }).strict();
export const MEASUREMENT_LIMITS = {
  queueEvents: 1000, queueBytes: 2 * 1024 * 1024, batchEvents: 50, batchBytes: 128 * 1024,
  queueAgeMs: 7 * 86400000, futureSkewMs: 5 * 60000, visitIdleMs: 30 * 60000,
  guestContinuityMs: 90 * 86400000, rawRetentionDays: 90, diagnosticRetentionDays: 30, aggregateRetentionMonths: 24,
} as const;

export const MeasurementBootstrapRequestSchema = z.object({ visitId: id.optional() }).strict();
export const MeasurementBootstrapResponseSchema = z.object({
 visitId: id, generation: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
 purposes: z.array(z.enum(["product_improvement", "product_reliability"])).min(1).max(2),
 guestCapability: z.string().regex(/^mg_[A-Za-z0-9_-]{43}$/).optional(),
}).strict();
export type MeasurementBootstrapResponse = z.infer<typeof MeasurementBootstrapResponseSchema>;
