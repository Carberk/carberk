import { createHash } from "node:crypto";

import type { PrismaService } from "@auto-tm/db";
import { ImprovementSchemas, MeasurementSchemas } from "@auto-tm/contracts";

import { protectImprovement,freezeImprovementRelease } from "./ImprovementDisclosure";
import { compileScorecard, type ScorecardFact } from "./MeasurementScorecard";

export class RecomputeImprovement {
 constructor(private readonly prisma:PrismaService,private readonly scope:{epoch:string;environment:"test"|"staging";population:"synthetic"},private readonly now:()=>Date=()=>new Date()) {}
 /** Fixed disjoint weekly releases. Matured rates publish once; Today exposes freshness only. */
 async execute() {
  const now=this.now();
  if(!this.scope.epoch) return;
  await this.prisma.$transaction(async tx=>{
   await tx.$executeRaw`SET LOCAL statement_timeout='5000ms'`;
   const states=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
   if(states[0]?.epoch!==this.scope.epoch) return;
   const baseline=await tx.measurementState.findUnique({where:{key:`inventory_baseline:${this.scope.epoch}`}});
   const rows=await tx.measurementRecord.findMany({where:{environment:this.scope.environment,population:this.scope.population,receivedAt:{lte:now},expiresAt:{gt:now}},include:{principal:{select:{pseudonym:true,kind:true,epoch:true,createdAt:true}}},orderBy:[{occurredAt:"asc"},{id:"asc"}],take:50001});
   if(rows.length>50000) throw new Error("Improvement recomputation capacity exceeded");
   const pending=await tx.measurementOutbox.findFirst({where:{epoch:this.scope.epoch,environment:this.scope.environment,population:this.scope.population},orderBy:{createdAt:"asc"},select:{createdAt:true}});
   const completeThrough=pending?.createdAt && pending.createdAt<now?pending.createdAt:now;
   const facts:ScorecardFact[]=[];
   for(const row of rows) {
    const event=MeasurementSchemas.MeasurementEventSchema.safeParse(row.event);
    if(event.success && row.principal.epoch===this.scope.epoch && (row.principal.kind==="account" || row.principal.kind==="guest")) facts.push({subject:row.principal.pseudonym,kind:row.principal.kind,firstObservedAt:row.principal.createdAt,conversionEligible:row.conversionEligible,event:event.data});
   }
   for(const period of ["completed_week","previous_week","today"] as const) {
    const {from,to}=ImprovementSchemas.improvementWindow(period,now);
    if(from>=to) continue;
    const key=`${this.scope.epoch}:${this.scope.environment}:${this.scope.population}:${period==="today"?"today":"week"}:${from.toISOString()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const previous=await tx.measurementRollup.findUnique({where:{key}});
    const old=ImprovementSchemas.ImprovementSnapshotSchema.safeParse(previous?.metrics);
    const released=old.success && old.data.period!=="today" && old.data.state!=="delayed" && (old.data.scorecard?.disclosure?.policy==="fixed-week-v1" || old.data.state==="suppressed");
    const releaseAt=released && old.success && old.data.generatedAt?Date.parse(old.data.generatedAt):now.getTime();
    const cohortMembers=new Set(rows.filter(row=>row.receivedAt.getTime()<=releaseAt).map(row=>row.principal.pseudonym));
    const bounded=facts.filter(fact=>fact.event.eventName!=="listing_visibility_changed" || Date.parse(fact.event.occurredAt)<to.getTime()).map(fact=>({...fact,cohortEligible:cohortMembers.has(fact.subject)}));
    // Opening facts themselves must have arrived by release; an old principal cannot add a new late draft/message cohort.
    const beforeRelease=new Set(rows.filter(row=>row.receivedAt.getTime()<=releaseAt).map(row=>row.id));
    for(const fact of bounded)if(["draft_started","first_buyer_message_accepted"].includes(fact.event.eventName))fact.cohortEligible=beforeRelease.has(fact.event.eventId);
    const subjectCount=new Set(facts.filter(fact=>fact.conversionEligible && Date.parse(fact.event.occurredAt)>=from.getTime() && Date.parse(fact.event.occurredAt)<to.getTime()).map(fact=>fact.subject)).size;
    const input={from,to,asOf:now,completeThrough,facts:bounded};
    const computed=protectImprovement(input,compileScorecard(input));
    const state=period==="today"?"suppressed":released && old.success?old.data.state:computed.state==="delayed"?"delayed":subjectCount>0 && subjectCount<5?"suppressed":computed.state;
    const inventoryAvailable=Boolean(baseline && Number.isFinite(Date.parse(baseline.epoch)) && Date.parse(baseline.epoch)<=from.getTime());
    const lateRecords=(previous?.lateRecords ?? 0)+(previous?rows.filter(row=>row.receivedAt>previous.generatedAt && row.occurredAt<previous.windowTo).length:0);
    const snapshot:ImprovementSchemas.ImprovementSnapshot={state,period,windowFrom:from.toISOString(),windowTo:to.toISOString(),generatedAt:new Date(releaseAt).toISOString(),completeThrough:completeThrough.toISOString(),
     environment:this.scope.environment,population:this.scope.population,version:1,lateRecords:null,inventoryAvailable:period!=="today"&&inventoryAvailable,scorecard:state==="suppressed" || state==="delayed"?null:computed};
    if(snapshot.scorecard && !inventoryAvailable) {
     snapshot.scorecard.inventory={listingHours:null,averageActive:null,currentActive:null};
     snapshot.scorecard.contacts.perActiveListing=null;
    }
    if(released && old.success && old.data.scorecard && snapshot.scorecard){
     snapshot.scorecard=freezeImprovementRelease(snapshot.scorecard,old.data.scorecard);
     snapshot.inventoryAvailable=old.data.inventoryAvailable;
    }
    const metrics=JSON.parse(JSON.stringify(snapshot));
    const inputDigest=createHash("sha256").update(JSON.stringify(rows.map(row=>[row.id,row.receivedAt.toISOString(),row.conversionEligible]))).digest("hex");
    const expiresAt=new Date(now);expiresAt.setUTCMonth(expiresAt.getUTCMonth()+24);
    const values={version:1,epoch:this.scope.epoch,environment:this.scope.environment,population:this.scope.population,windowFrom:from,windowTo:to,completeThrough,inputDigest,lateRecords,metrics,generatedAt:now,expiresAt};
    await tx.measurementRollup.upsert({where:{key},create:{key,...values},update:values});
   }
  },{timeout:20_000,maxWait:1000});
 }
}
