import { createHash } from "node:crypto";

import type { PrismaService } from "@auto-tm/db";
import type { ImprovementSchemas} from "@auto-tm/contracts";
import { MeasurementSchemas } from "@auto-tm/contracts";

import { compileScorecard, type ScorecardFact } from "./MeasurementScorecard";

const DAY=86_400_000;
export class RecomputeImprovement {
 constructor(private readonly prisma:PrismaService,private readonly scope:{epoch:string;environment:"test"|"staging";population:"synthetic"},private readonly now:()=>Date=()=>new Date()) {}
 /** Recompute both completed windows and Today from all retained facts on every tick. Late delivery updates the digest/versioned snapshot. */
 async execute() {
  const now=this.now(),midnight=Math.floor(now.getTime()/DAY)*DAY;
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
    const from=new Date(period==="today"?midnight:midnight-(period==="previous_week"?14:7)*DAY);
    const to=new Date(period==="today"?now:period==="previous_week"?midnight-7*DAY:midnight);
    if(from>=to) continue;
    const key=`${this.scope.epoch}:${this.scope.environment}:${this.scope.population}:${period}:${from.toISOString()}`;
    const previous=await tx.measurementRollup.findUnique({where:{key}});
    const subjectCount=new Set(facts.filter(fact=>fact.conversionEligible && Date.parse(fact.event.occurredAt)>=from.getTime() && Date.parse(fact.event.occurredAt)<to.getTime()).map(fact=>fact.subject)).size;
    const computed=compileScorecard({from,to,asOf:now,completeThrough,facts});
    const state=computed.state==="delayed"?"delayed":subjectCount>0 && subjectCount<5?"suppressed":computed.state;
    const inventoryAvailable=Boolean(baseline && Number.isFinite(Date.parse(baseline.epoch)) && Date.parse(baseline.epoch)<=from.getTime());
    const lateRecords=(previous?.lateRecords ?? 0)+(previous?rows.filter(row=>row.receivedAt>previous.generatedAt && row.occurredAt<previous.windowTo).length:0);
    const snapshot:ImprovementSchemas.ImprovementSnapshot={state,period,windowFrom:from.toISOString(),windowTo:to.toISOString(),generatedAt:now.toISOString(),completeThrough:completeThrough.toISOString(),
     environment:this.scope.environment,population:this.scope.population,version:1,lateRecords,inventoryAvailable,scorecard:state==="suppressed" || state==="delayed"?null:computed};
    if(snapshot.scorecard && !inventoryAvailable) {
     snapshot.scorecard.inventory={listingHours:null,averageActive:null,currentActive:null};
     snapshot.scorecard.contacts.perActiveListing=null;
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
