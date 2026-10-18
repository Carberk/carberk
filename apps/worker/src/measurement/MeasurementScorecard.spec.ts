import { describe, expect, it } from "vitest";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { compileScorecard, type ScorecardFact } from "./MeasurementScorecard";
const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-02T00:00:00Z"), asOf = new Date("2026-11-15T00:00:00Z");
let sequence = 0;
function fact(name: string, payload: object, occurredAt: string, subject = "account-one", eligible = true): ScorecardFact {
 const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
 return { subject, kind: "account", conversionEligible: eligible, event: { version: 1, eventId: id, eventName: name, purpose: "product_improvement", occurredAt, context: { platform: "server", release: "1", build: "1", locale: "en" }, payload } as MeasurementSchemas.MeasurementEvent };
}
const compile = (facts: ScorecardFact[]) => compileScorecard({ from, to, asOf, completeThrough: asOf, facts });
describe("reproducible first-party scorecard", () => {
 it("integrates 42 eligible Listing hours as 1.75 despite duplicates and reversed visibility, with 2 current active", () => {
  const facts = [fact("listing_visibility_changed", { listingId: "A", visibility: "public", reason: "published" }, "2026-10-01T00:00:00Z"), fact("listing_visibility_changed", { listingId: "B", visibility: "public", reason: "published" }, "2026-10-01T00:00:00Z"), fact("listing_visibility_changed", { listingId: "B", visibility: "hidden", reason: "moderated" }, "2026-10-01T06:00:00Z"), fact("listing_visibility_changed", { listingId: "B", visibility: "public", reason: "restored" }, "2026-10-01T18:00:00Z"), fact("listing_visibility_changed", { listingId: "C", visibility: "public", reason: "published" }, "2026-10-01T12:00:00Z"), fact("listing_visibility_changed", { listingId: "C", visibility: "hidden", reason: "archived" }, "2026-10-01T18:00:00Z")];
  const result = compile([...facts.reverse(), facts[0] as ScorecardFact]);
  expect(result.inventory).toEqual({ listingHours: 42, averageActive: 1.75, currentActive: 2 });
 });
 it("counts Call intent per subject/Listing/UTC day and new Conversation once, excluding trusted owner conversions", () => {
  const call = fact("call_intent", { listingId: "A" }, "2026-10-01T01:00:00Z");
  const start = fact("conversation_created", { conversationId: "C", listingId: "A" }, "2026-10-01T02:00:00Z");
  const result = compile([call, call, fact("call_intent", { listingId: "A" }, "2026-10-01T03:00:00Z"), start, start, fact("call_intent", { listingId: "A" }, "2026-10-01T03:00:00Z", "owner", false)]);
  expect(result.contacts).toEqual({ calls: 1, conversations: 1, total: 2, perActiveListing: null });
 });
 it("reproduces 7 of 18 seven-day publications and 4 of 5 matured 24-hour replies", () => {
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
 it("shows 16 contacts per 12 time-weighted active Listings and current inventory separately", () => {
  const facts: ScorecardFact[] = [];
  for(let index=0;index<12;index++) facts.push(fact("listing_visibility_changed",{listingId:`L-${index}`,visibility:"public",reason:"published"},"2026-10-01T00:00:00Z"));
  for(let index=0;index<11;index++) facts.push(fact("call_intent",{listingId:"L-0"},"2026-10-01T01:00:00Z",`buyer-${index}`));
  for(let index=0;index<5;index++) facts.push(fact("conversation_created",{conversationId:`C-${index}`,listingId:"L-0"},"2026-10-01T01:00:00Z",`buyer-${index}`));
  for(let index=12;index<14;index++) facts.push(fact("listing_visibility_changed",{listingId:`L-${index}`,visibility:"public",reason:"published"},"2026-10-02T00:00:00Z"));
  expect(compile(facts).contacts).toEqual({calls:11,conversations:5,total:16,perActiveListing:16/12});
  expect(compile(facts).inventory.currentActive).toBe(14);
 });
 it("counts distinct attempt outcomes and discovery facts rather than duplicate deliveries", () => {
  const facts: ScorecardFact[] = [];
  for(let index=0;index<22;index++) facts.push(fact("sign_in_result",{attemptId:`sign-${index}`,result:index<21?"success":"technical_failure",durationMs:1},"2026-10-01T01:00:00Z"));
  for(let index=0;index<20;index++) facts.push(fact("media_upload_result",{attemptId:`upload-${index}`,kind:"photo",result:index<15?"success":"technical_failure",durationMs:1},"2026-10-01T01:00:00Z"));
  for(let index=0;index<3;index++) facts.push(fact("discovery_opened",{screen:"home"},"2026-10-01T01:00:00Z"));
  for(let index=0;index<2;index++) facts.push(fact("search_completed",{resultCount:index===0?"zero":"1_5",filters:{}},"2026-10-01T01:00:00Z"));
  for(let index=0;index<4;index++) facts.push(fact("listing_detail_opened",{listingId:"L"},"2026-10-01T01:00:00Z"));
  const result=compile([...facts,...facts]);
  expect(result.signIn).toMatchObject({numerator:21,denominator:22});
  expect(result.upload).toMatchObject({numerator:15,denominator:20});
  expect(result.discovery).toEqual({opens:3,searches:2,detailOpens:4});
  expect(result.zeroSearches).toMatchObject({numerator:1,denominator:2,value:0.5});
 });
 it("uses separate account and guest exact UTC return-day cohorts with immature D30 withheld", () => {
  const facts:ScorecardFact[]=[];
  for(const [kind,total,d1,d7] of [["account",12,6,4],["guest",8,3,2]] as const) {
   for(let index=0;index<total;index++) {
    const add=(day:string)=>{const result=fact("visit_started",{screen:"home"},`2026-10-${day}T23:59:00Z`,`${kind}-${index}`);result.kind=kind;facts.push(result);};
    add("01"); if(index<d1) {add("02");add("02");} if(index<d7) add("08");
   }
  }
  const result=compileScorecard({from,to,asOf:new Date("2026-10-10T00:00:00Z"),completeThrough:new Date("2026-10-10T00:00:00Z"),facts});
  expect(result.retention.accounts.d1).toMatchObject({numerator:6,denominator:12,value:0.5});
  expect(result.retention.accounts.d7).toMatchObject({numerator:4,denominator:12});
  expect(result.retention.guests.d1).toMatchObject({numerator:3,denominator:8});
  expect(result.retention.guests.d7).toMatchObject({numerator:2,denominator:8});
  expect(result.retention.accounts.d30).toMatchObject({state:"immature",value:null,denominator:null});
 });

 it("retains all seven canonical Sell steps and counts each draft step only once", () => {
  const opened=fact("wizard_step_opened",{draftId:"D",step:"photos"},"2026-10-01T01:00:00Z");
  const completed=fact("wizard_step_result",{draftId:"D",step:"photos",attemptId:"attempt",result:"success",durationMs:2},"2026-10-01T02:00:00Z");
  const result=compile([opened,opened,completed,completed]);
  expect(result.steps.map(item=>item.step)).toEqual(["vehicle","specs","photos","price","location","contact","review"]);
  expect(result.steps[2]).toMatchObject({step:"photos",opened:1,completed:1});
 });

});

it("does not turn an old retained principal into a new cohort after raw history expires",()=>{
 const old={...fact("foreground_activity",{screen:"home",action:"open"},"2026-10-01T01:00:00Z","existing-account"),firstObservedAt:new Date("2026-05-01T00:00:00Z")};
 const fresh={...fact("visit_started",{screen:"home"},"2026-10-01T01:00:00Z","fresh-account"),firstObservedAt:new Date("2026-10-01T01:00:00Z")};
 const returning={...fact("foreground_activity",{screen:"home",action:"open"},"2026-10-02T01:00:00Z","fresh-account"),firstObservedAt:new Date("2026-10-01T01:00:00Z")};
 expect(compile([old,fresh,returning]).retention.accounts.d1).toMatchObject({numerator:1,denominator:1,value:1});
});

it("withholds inventory when contradictory same-millisecond transitions have no authoritative order",()=>{
 const facts=[fact("listing_visibility_changed",{listingId:"same-listing",visibility:"public",reason:"published"},"2026-10-01T01:00:00Z"),fact("listing_visibility_changed",{listingId:"same-listing",visibility:"hidden",reason:"archived"},"2026-10-01T01:00:00Z")];
 for(const ordered of [facts,[...facts].reverse()]){const score=compile(ordered);expect(score.inventory).toEqual({listingHours:null,averageActive:null,currentActive:null});expect(score.contacts.perActiveListing).toBeNull();}
});
