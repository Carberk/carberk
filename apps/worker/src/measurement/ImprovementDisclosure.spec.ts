import { expect,it } from "vitest";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { compileScorecard,type ScorecardFact } from "./MeasurementScorecard";
import { protectImprovement,freezeImprovementRelease } from "./ImprovementDisclosure";
const from=new Date("2026-10-05T00:00:00Z"),to=new Date("2026-10-12T00:00:00Z"),asOf=new Date("2026-11-20T00:00:00Z");let sequence=0;
function fact(eventName:string,payload:object,subject:string):ScorecardFact{return {subject,kind:"account",conversionEligible:true,event:{version:1,eventId:`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`,purpose:"product_improvement",eventName,payload,occurredAt:"2026-10-06T00:00:00Z",context:{platform:"android",release:"1",build:"1",locale:"en"}} as MeasurementSchemas.MeasurementEvent};}
function release(facts:ScorecardFact[]){const input={from,to,asOf,completeThrough:asOf,facts};return protectImprovement(input,compileScorecard(input));}
it("withholds a one-person metric despite a larger window and repeated events",()=>{
 const facts=Array.from({length:10},(_,index)=>fact("discovery_opened",{screen:"home"},`person-${index}`));facts.push(...Array.from({length:8},(_,index)=>fact("call_intent",{listingId:`listing-${index}`},"one-caller")));
 expect(release(facts).contacts).toEqual({calls:null,conversations:null,total:null,perActiveListing:null});expect(release(facts).discovery.opens).toBe(10);
});
it("withholds a small failure complement even when total attempts and successes look large",()=>{
 const facts=Array.from({length:10},(_,index)=>fact("sign_in_result",{attemptId:`attempt-${index}`,result:index===9?"technical_failure":"success",durationMs:10},`person-${index}`));
 expect(release(facts).signIn).toEqual({state:"suppressed",numerator:null,denominator:null,value:null,smallSample:false});
});
it("never releases corrected counts that can be subtracted from an earlier fixed partition",()=>{
 const initial=release(Array.from({length:10},(_,index)=>fact("discovery_opened",{screen:"home"},`person-${index}`))),corrected=release(Array.from({length:11},(_,index)=>fact("discovery_opened",{screen:"home"},`person-${index}`)));
 expect(freezeImprovementRelease(corrected,initial).discovery.opens).toBe(10);
});
