"use server";
import { ImprovementSchemas } from "@auto-tm/contracts";
import { unstable_rethrow } from "next/navigation";

import { rejectExpiredSession } from "@/lib/action-session";
import { apiFetch,ApiError } from "@/lib/api-client";

type Failure={ok:false;error:"denied"|"error"};
const failure=(error:unknown):Failure=>({ok:false,error:error instanceof ApiError && error.status===403?"denied":"error"});
export async function loadImprovement(period:ImprovementSchemas.ImprovementPeriod):Promise<{ok:true;current:ImprovementSchemas.ImprovementSnapshot;previous:ImprovementSchemas.ImprovementSnapshot|null}|Failure> {
 await rejectExpiredSession();
 if(!ImprovementSchemas.ImprovementPeriodSchema.safeParse(period).success) return {ok:false,error:"error"};
 try {
  const [current,previous]=await Promise.all([apiFetch(`/improvement/scorecard?period=${period}`),period==="completed_week"?apiFetch("/improvement/scorecard?period=previous_week"):Promise.resolve(null)]);
  return {ok:true,current:ImprovementSchemas.ImprovementSnapshotSchema.parse(current),previous:previous?ImprovementSchemas.ImprovementSnapshotSchema.parse(previous):null};
 } catch(error) {unstable_rethrow(error);return failure(error);}
}
export async function openInvestigation(input:unknown):Promise<{ok:true;receipt:{id:string;expiresAt:string};timeline:ImprovementSchemas.ImprovementTimeline}|Failure> {
 await rejectExpiredSession();
 const parsed=ImprovementSchemas.ImprovementInvestigationRequestSchema.safeParse(input);
 if(!parsed.success) return {ok:false,error:"error"};
 try {
  const receipt=ImprovementSchemas.ImprovementArtifactReceiptSchema.parse(await apiFetch("/improvement/investigations",{method:"POST",body:parsed.data}));
  const timeline=ImprovementSchemas.ImprovementTimelineSchema.parse(await apiFetch(`/improvement/artifacts/${receipt.id}`));
  return {ok:true,receipt,timeline};
 } catch(error) {unstable_rethrow(error);return failure(error);}
}

export async function loadMarketResearch():Promise<{ok:true;datasets:ImprovementSchemas.MarketKnowledgeView[]}|Failure> {
 await rejectExpiredSession();
 try {
  const data=await apiFetch<unknown>("/improvement/research");
  if(!Array.isArray(data)||data.length>20)throw new Error("Invalid research response");
  return {ok:true,datasets:data.map(item=>ImprovementSchemas.MarketKnowledgeViewSchema.parse(item))};
 } catch(error) {unstable_rethrow(error);return failure(error);}
}
export async function exportMarketResearch(id:string,reason:string):Promise<{ok:true;receipt:{id:string;expiresAt:string}}|Failure> {
 await rejectExpiredSession();
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||reason.trim().length<8||reason.length>500)return {ok:false,error:"error"};
 try {return {ok:true,receipt:ImprovementSchemas.ImprovementArtifactReceiptSchema.parse(await apiFetch(`/improvement/research/${id}/exports`,{method:"POST",body:{reason:reason.trim()}}))};}
 catch(error) {unstable_rethrow(error);return failure(error);}
}
