import { describe, expect, it } from "vitest";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { compileScorecard, type ScorecardFact } from "./MeasurementScorecard";
const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-02T00:00:00Z"), asOf = new Date("2026-11-15T00:00:00Z");
let sequence = 0;
function fact(name: string, payload: object, occurredAt: string, subject = "account-one", eligible = true): ScorecardFact {
 const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
 return { subject, kind: "account", conversionEligible: eligible, event: { version: 1, eventId: id, eventName: name, purpose: "product_improvement", occurredAt, context: { platform: "server", release: "1", build: "1", locale: "en" }, payload } as MeasurementSchemas.MeasurementEvent };
}
const compile = (facts: ScorecardFact[]) => compileScorecard({ from, to, asOf, completeThrough: to, facts });
describe("reproducible first-party scorecard", () => {
 it("integrates42eligible Listing hours as1.75 despite duplicate and out-of-order visibility, with2current active", () => {
  const facts = [fact("listing_visibility_changed", { listingId: "A", visibility: "public", reason: "published" }, "2026-10-01T00:00:00Z"), fact("listing_visibility_changed", { listingId: "B", visibility: "public", reason: "published" }, "2026-10-01T00:00:00Z"), fact("listing_visibility_changed", { listingId: "B", visibility: "hidden", reason: "moderated" }, "2026-10-01T06:00:00Z"), fact("listing_visibility_changed", { listingId: "B", visibility: "public", reason: "restored" }, "2026-10-01T18:00:00Z"), fact("listing_visibility_changed", { listingId: "C", visibility: "public", reason: "published" }, "2026-10-01T12:00:00Z"), fact("listing_visibility_changed", { listingId: "C", visibility: "hidden", reason: "archived" }, "2026-10-01T18:00:00Z")];
  const result = compile([...facts.reverse(), facts[0]!]);
  expect(result.inventory).toEqual({ listingHours: 42, averageActive: 1.75, currentActive: 2 });
 });
 it("counts Call intent per subject/Listing/UTC day and new Conversation once, excluding trusted owner conversions", () => {
  const call = fact("call_intent", { listingId: "A" }, "2026-10-01T01:00:00Z");
  const start = fact("conversation_created", { conversationId: "C", listingId: "A" }, "2026-10-01T02:00:00Z");
  const result = compile([call, call, fact("call_intent", { listingId: "A" }, "2026-10-01T03:00:00Z"), start, start, fact("call_intent", { listingId: "A" }, "2026-10-01T03:00:00Z", "owner", false)]);
  expect(result.contacts).toEqual({ calls: 1, conversations: 1, total: 2, perActiveListing: null });
 });
 it("reproduces7of18seven-day publication and4of5matured24hour replies", () => {
  const facts: ScorecardFact[] = [];
  for (let index=0;index<18;index++) { facts.push(fact("draft_started", { draftId: `draft-${index}` }, "2026-10-01T01:00:00Z", `seller-${index}`)); if(index<7) facts.push(fact("listing_published", { draftId: `draft-${index}`, listingId: `listing-${index}`, cityId:"city" }, "2026-10-05T01:00:00Z", `seller-${index}`)); }
  for(let index=0;index<5;index++) { facts.push(fact("first_buyer_message_accepted", { conversationId: `conversation-${index}`, listingId: "L", messageId: `message-${index}` }, "2026-10-01T01:00:00Z", `buyer-${index}`)); if(index<4) facts.push(fact("seller_first_reply", { conversationId: `conversation-${index}`, listingId:"L", firstBuyerMessageId:`message-${index}`, replyMessageId:`reply-${index}`, elapsedMs: 3600000 }, "2026-10-01T02:00:00Z", "seller")); }
  const result=compile(facts); expect(result.publication).toMatchObject({ numerator:7, denominator:18, value:7/18, smallSample:true }); expect(result.replies).toMatchObject({ numerator:4, denominator:5, value:0.8, smallSample:true });
 });
 it("distinguishes delayed collection, immature observation and completed empty data", () => {
  expect(compileScorecard({ from,to,asOf,completeThrough:from,facts:[] }).state).toBe("delayed");
  expect(compile([fact("draft_started",{draftId:"draft"},"2026-10-01T01:00:00Z")]).state).toBe("ready");
  expect(compileScorecard({from,to,asOf:to,completeThrough:to,facts:[fact("draft_started",{draftId:"draft"},"2026-10-01T01:00:00Z")]}).publication.state).toBe("immature");
  expect(compile([]).state).toBe("empty");
 });
});
