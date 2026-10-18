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
it("publishes a fully matured cohort once and never replaces its released rate",()=>{
 const drafts=Array.from({length:10},(_,index)=>fact("draft_started",{draftId:`draft-${index}`},`seller-${index}`));
 const before={from,to,asOf:to,completeThrough:to,facts:drafts},initial=protectImprovement(before,compileScorecard(before));
 expect(initial.publication.state).toBe("immature");
 const publications=Array.from({length:5},(_,index)=>fact("listing_published",{draftId:`draft-${index}`,listingId:`listing-${index}`,cityId:"city"},`seller-${index}`));
 const matured=release([...drafts,...publications]),published=freezeImprovementRelease(matured,initial);
 expect(published.publication).toMatchObject({state:"ready",numerator:5,denominator:10});
 const corrected=release([...drafts,...publications,fact("listing_published",{draftId:"draft-5",listingId:"listing-5",cityId:"city"},"seller-5")]);
 expect(freezeImprovementRelease(corrected,published).publication).toEqual(published.publication);
});
it("does not add late draft or first-foreground cohort members after release",()=>{
 const draft={...fact("draft_started",{draftId:"late-draft"},"late-seller"),cohortEligible:false};
 const visit={...fact("visit_started",{screen:"home"},"late-visitor"),cohortEligible:false};
 const result=release([draft,visit]);expect(result.publication).toMatchObject({state:"empty",denominator:0});expect(result.retention.accounts.d1).toMatchObject({state:"empty",denominator:0});
});

it("withholds the full wizard when adjacent safe totals expose a small progression difference",()=>{
 const facts:ScorecardFact[]=[];
 for(const [step,count] of [["vehicle",10],["specs",9]] as const)for(let index=0;index<count;index++){facts.push(fact("wizard_step_opened",{step},`seller-${index}`),fact("wizard_step_result",{step,result:"success"},`seller-${index}`));}
 const result=release(facts);expect(result.steps.every(step=>step.opened===null&&step.completed===null)).toBe(true);expect(result.disclosure?.suppressedMetrics).toContain("steps");
});
