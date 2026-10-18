import type { ImprovementSchemas } from "@auto-tm/contracts";

import type { ScorecardFact,ScorecardInput } from "./MeasurementScorecard";
type Scorecard=ImprovementSchemas.ImprovementScorecard;
type Rate=ImprovementSchemas.ImprovementRate;
const time=(fact:ScorecardFact)=>Date.parse(fact.event.occurredAt),DAY=86400000;
const subjects=(facts:readonly ScorecardFact[])=>new Set(facts.map(fact=>fact.subject)).size;
const small=(count:number)=>count>0&&count<5;
const unsafe=(count:number|null,facts:readonly ScorecardFact[])=>count!==null&&count>0&&(small(count)||subjects(facts)<5);
/** A repeated actor cannot satisfy a group threshold. Small complementary outcomes withhold their entire rate/group. */
export function protectImprovement(input:ScorecardInput,scorecard:Scorecard):Scorecard {
 const score=structuredClone(scorecard),suppressed:string[]=[],seen=new Set<string>();
 const facts=input.facts.filter(fact=>{if(!fact.conversionEligible||seen.has(fact.event.eventId))return false;seen.add(fact.event.eventId);return time(fact)<=input.asOf.getTime();});
 const window=facts.filter(fact=>time(fact)>=input.from.getTime()&&time(fact)<input.to.getTime());
 const unique=(items:ScorecardFact[],key:(fact:ScorecardFact)=>string)=>{const entries=new Map<string,ScorecardFact>();for(const fact of [...items].sort((a,b)=>time(a)-time(b)||a.event.eventId.localeCompare(b.event.eventId)))if(!entries.has(key(fact)))entries.set(key(fact),fact);return [...entries.values()];};
 const cohortKey=(fact:ScorecardFact)=>{const event=fact.event;switch(event.eventName){case "draft_started":return event.payload.draftId;case "conversation_created":case "first_buyer_message_accepted":return event.payload.conversationId;case "sign_in_result":case "media_upload_result":return event.payload.attemptId;default:return event.eventId;}};
 const named=(name:string)=>unique(window.filter(fact=>fact.event.eventName===name),cohortKey);
 const publications=new Map<string,number>(),replies=new Map<string,number>(),activeDays=new Map<string,Set<number>>();
 for(const fact of facts){const event=fact.event;if(event.eventName==="listing_published"&&event.payload.draftId)publications.set(event.payload.draftId,Math.min(publications.get(event.payload.draftId)??Infinity,time(fact)));if(event.eventName==="seller_first_reply")replies.set(event.payload.firstBuyerMessageId,Math.min(replies.get(event.payload.firstBuyerMessageId)??Infinity,time(fact)));if(["visit_started","foreground_activity"].includes(event.eventName)){const days=activeDays.get(fact.subject)??new Set<number>();days.add(Math.floor(time(fact)/DAY));activeDays.set(fact.subject,days);}}

 const hide=(name:string)=>{suppressed.push(name);};
 const protectRate=(name:string,value:Rate,cohort:ScorecardFact[],succeeded:(fact:ScorecardFact)=>boolean):Rate=>{
  if(value.state!=="ready")return value;
  const successes=cohort.filter(succeeded),failures=cohort.filter(fact=>!succeeded(fact));
  if(unsafe(value.denominator,cohort)||unsafe(value.numerator,successes)||unsafe((value.denominator??0)-(value.numerator??0),failures)){
   hide(name);return {state:"suppressed",numerator:null,denominator:null,value:null,smallSample:false};
  }
  return value;
 };
 const visibility=facts.filter(fact=>fact.event.eventName==="listing_visibility_changed"&&time(fact)<input.to.getTime());
 if((score.inventory.listingHours??0)>0&&subjects(visibility)<5 || small(score.inventory.currentActive??0)){
  score.inventory={listingHours:null,averageActive:null,currentActive:null};hide("inventory");
 }
 if(unsafe(score.contacts.calls,named("call_intent"))||unsafe(score.contacts.conversations,named("conversation_created"))||unsafe(score.contacts.total,window.filter(fact=>["call_intent","conversation_created"].includes(fact.event.eventName)))){
  score.contacts={calls:null,conversations:null,total:null,perActiveListing:null};hide("contacts");
 }
 if(score.inventory.averageActive===null)score.contacts.perActiveListing=null;
 for(const [key,name] of [["opens","discovery_opened"],["searches","search_completed"],["detailOpens","listing_detail_opened"]] as const){
  if(unsafe(score.discovery[key],named(name))){score.discovery[key]=null;hide(`discovery.${key}`);}
 }
 if(unsafe(score.firstBuyerMessages,named("first_buyer_message_accepted"))){score.firstBuyerMessages=null;hide("firstBuyerMessages");}
 for(const step of score.steps){
  const opened=named("wizard_step_opened").filter(fact=>fact.event.eventName==="wizard_step_opened"&&fact.event.payload.step===step.step);
  const completed=named("wizard_step_result").filter(fact=>fact.event.eventName==="wizard_step_result"&&fact.event.payload.step===step.step&&fact.event.payload.result==="success");
  if(unsafe(step.opened,opened)||unsafe(step.completed,completed)||small(Math.abs((step.opened??0)-(step.completed??0)))){step.opened=null;step.completed=null;hide(`steps.${step.step}`);}
 }
 // A partial wizard would expose a withheld step or a tiny inter-step complement by subtraction.
 const stepCounts=score.steps.flatMap(step=>[step.opened,step.completed]).filter((count):count is number=>count!==null);
 if(score.steps.some(step=>step.opened===null||step.completed===null)||stepCounts.some((count,index)=>stepCounts.slice(index+1).some(other=>small(Math.abs(count-other))))){
  for(const step of score.steps){step.opened=null;step.completed=null;}hide("steps");
 }
 const successful=(fact:ScorecardFact)=>"result"in fact.event.payload&&fact.event.payload.result==="success";
 score.signIn=protectRate("signIn",score.signIn,named("sign_in_result"),successful);
 score.upload=protectRate("upload",score.upload,named("media_upload_result"),successful);
 score.zeroSearches=protectRate("zeroSearches",score.zeroSearches,named("search_completed"),fact=>fact.event.eventName==="search_completed"&&fact.event.payload.resultCount==="zero");
 const published=(fact:ScorecardFact)=>{if(fact.event.eventName!=="draft_started")return false;const draftId=fact.event.payload.draftId;const published=publications.get(draftId);return published!==undefined&&published>=time(fact)&&published<=time(fact)+7*DAY;};
 score.publication=protectRate("publication",score.publication,named("draft_started").filter(fact=>fact.cohortEligible!==false),published);
 const replied=(fact:ScorecardFact)=>{if(fact.event.eventName!=="first_buyer_message_accepted")return false;const messageId=fact.event.payload.messageId;const replied=replies.get(messageId);return replied!==undefined&&replied>=time(fact)&&replied<=time(fact)+DAY;};
 score.replies=protectRate("replies",score.replies,named("first_buyer_message_accepted").filter(fact=>fact.cohortEligible!==false),replied);
 for(const [kind,key] of [["account","accounts"],["guest","guests"]] as const){
  const first=new Map<string,ScorecardFact>();
  for(const fact of [...facts].sort((a,b)=>time(a)-time(b)))if(fact.cohortEligible!==false&&fact.kind===kind&&["visit_started","foreground_activity"].includes(fact.event.eventName)&&!first.has(fact.subject))first.set(fact.subject,fact);
  const cohort=[...first.values()].filter(fact=>{const started=fact.firstObservedAt?.getTime()??time(fact);return started>=input.from.getTime()&&started<input.to.getTime();});
  for(const [label,days]of [["d1",1],["d7",7],["d30",30]]as const)score.retention[key][label]=protectRate(`retention.${key}.${label}`,score.retention[key][label],cohort,fact=>activeDays.get(fact.subject)?.has(Math.floor((fact.firstObservedAt?.getTime()??time(fact))/DAY)+days)===true);
 }
 score.disclosure={policy:"fixed-week-v1",suppressedMetrics:suppressed};return score;
}
/** Counts are immutable. Each previously hidden maturity-bound rate may publish once, after its entire cohort matures. */
export function freezeImprovementRelease(candidate:Scorecard,previous:Scorecard):Scorecard {
 const result=structuredClone(previous),suppressed=new Set(previous.disclosure?.suppressedMetrics??[]);
 const final=(value:Rate)=>["ready","empty","suppressed"].includes(value.state);
 const release=(name:string,old:Rate,next:Rate)=>{if(final(old))return old;if(next.state==="suppressed")suppressed.add(name);return next;};
 for(const name of ["publication","replies","signIn","upload","zeroSearches"]as const)result[name]=release(name,previous[name],candidate[name]);
 for(const kind of ["accounts","guests"]as const)for(const day of ["d1","d7","d30"]as const)result.retention[kind][day]=release(`retention.${kind}.${day}`,previous.retention[kind][day],candidate.retention[kind][day]);
 result.disclosure={policy:"fixed-week-v1",suppressedMetrics:[...suppressed]};return result;
}
