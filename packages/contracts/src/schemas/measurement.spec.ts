import { describe, expect, it } from "vitest";

import { MeasurementEventSchema, MeasurementBatchSchema, EVENT_DICTIONARY } from "./measurement";

const event = { version: 1, eventId: "00000000-0000-4000-8000-000000000001", occurredAt: "2026-10-15T00:00:00.000Z",
  visitId: "00000000-0000-4000-8000-000000000002", purpose: "product_improvement", eventName: "listing_detail_opened",
  context: { platform: "android", release: "1.2.3", build: "42", locale: "tk", connection: "wifi" },
  payload: { listingId: "00000000-0000-4000-8000-000000000003" } };

describe("versioned first-party event dictionary", () => {
 it("accepts literal typed facts and publishes each fact's authoritative owner", () => {
  expect(MeasurementEventSchema.parse(event)).toEqual(event);
  expect(EVENT_DICTIONARY.listing_detail_opened).toEqual({ origin: "client", purpose: "product_improvement" });
  expect(EVENT_DICTIONARY.listing_published.origin).toBe("server");
  expect(EVENT_DICTIONARY.first_buyer_message_accepted.origin).toBe("server");
  expect(EVENT_DICTIONARY.call_intent.origin).toBe("client");
 });
 it.each(["message", "phone", "email", "vin", "token", "password", "otp", "url", "query", "advertisingId", "sdkMetadata", "accountId", "role", "environment", "population"])("rejects raw or client-authoritative %s at every object boundary", (key) => {
  const secret = "SENSITIVE_SENTINEL_contact_token_vin";
  for (const value of [{ ...event, [key]: secret }, { ...event, context: { ...event.context, [key]: secret } }, { ...event, payload: { ...event.payload, [key]: secret } }]) {
   const parsed = MeasurementEventSchema.safeParse(value);
   expect(parsed.success).toBe(false);
   if (!parsed.success) expect(JSON.stringify(parsed.error.issues)).not.toContain(secret);
  }
 });
 it("refuses unknown version/name/purpose, raw search text, invalid catalog IDs and unbounded context", () => {
  for (const value of [{ ...event, version: 2 }, { ...event, eventName: "sale_completed" }, { ...event, purpose: "advertising" },
   { ...event, payload: { listingId: "https://host/private?token=secret" } }, { ...event, context: { ...event.context, release: "x".repeat(65) } },
   { ...event, eventName: "search_completed", payload: { resultCount: "zero", filters: { query: "phone number" } } }]) {
   expect(MeasurementEventSchema.safeParse(value).success).toBe(false);
  }
 });
 it("keeps client sign-in transport uncertainty separate from authoritative results", () => {
  const transport = { ...event, eventName: "sign_in_transport_result", purpose: "product_reliability", payload: { attemptId: event.eventId, result: "unconfirmed_failure", category: "timeout", durationMs: 5000 } };
  expect(MeasurementEventSchema.safeParse(transport).success).toBe(true);
  expect(MeasurementEventSchema.safeParse({ ...transport, payload: { ...transport.payload, result: "success" } }).success).toBe(false);
 });
 it("records processing for exactly one real Listing or Draft without inventing ownership", () => {
  const payload = { jobId: event.eventId, attemptId: event.eventId, result: "success", durationMs: 1000 };
  const processing = { ...event, eventName: "video_processing_result", purpose: "product_reliability", context: { ...event.context, platform: "server" } };
  expect(MeasurementEventSchema.safeParse({ ...processing, payload: { ...payload, listingId: event.payload.listingId } }).success).toBe(true);
  expect(MeasurementEventSchema.safeParse({ ...processing, payload: { ...payload, draftId: event.payload.listingId } }).success).toBe(true);
  expect(MeasurementEventSchema.safeParse({ ...processing, payload }).success).toBe(false);
  expect(MeasurementEventSchema.safeParse({ ...processing, payload: { ...payload, listingId: event.payload.listingId, draftId: event.payload.listingId } }).success).toBe(false);
 });
 it("rejects impossible outcome fields, noncanonical wizard steps and oversized batches", () => {
  expect(MeasurementEventSchema.safeParse({ ...event, eventName: "call_intent", payload: { listingId: event.payload.listingId, completed: true } }).success).toBe(false);
  expect(MeasurementEventSchema.safeParse({ ...event, eventName: "wizard_step_opened", payload: { draftId: event.eventId, step: "entered secret" } }).success).toBe(false);
  expect(MeasurementBatchSchema.safeParse({ events: Array.from({ length: 51 }, () => event) }).success).toBe(false);
 });
});
