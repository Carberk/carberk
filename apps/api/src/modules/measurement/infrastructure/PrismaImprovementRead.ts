import { randomUUID } from "node:crypto";

import type { PrismaService } from "@auto-tm/db";
import { ImprovementSchemas, MeasurementSchemas } from "@auto-tm/contracts";

import type { StaffAuthorityPort, StaffSubject } from "../../identity/identity.public";

const DAY=86_400_000;
export class ImprovementAccessDenied extends Error {}
export class PrismaImprovementRead {
 constructor(private readonly prisma:PrismaService,private readonly authority:StaffAuthorityPort,private readonly scope:{epoch:string;environment:"test"|"staging"|"production";population:"synthetic"},private readonly now:()=>Date=()=>new Date()) {}
 private window(period:ImprovementSchemas.ImprovementPeriod) {
  const now=this.now(),midnight=Math.floor(now.getTime()/DAY)*DAY;
  return {from:new Date(period==="today"?midnight:midnight-(period==="previous_week"?14:7)*DAY),to:new Date(period==="today"?now:period==="previous_week"?midnight-7*DAY:midnight)};
 }
 async scorecard(subject:StaffSubject,period:ImprovementSchemas.ImprovementPeriod) {
  const {from,to}=this.window(period);
  const unavailable:ImprovementSchemas.ImprovementSnapshot={state:"unavailable",period,windowFrom:from.toISOString(),windowTo:to.toISOString(),generatedAt:null,completeThrough:null,environment:this.scope.environment,population:this.scope.population,version:1,lateRecords:0,inventoryAvailable:false,scorecard:null};
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.aggregate"},tx);
   const states=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
   if(!this.scope.epoch || states[0]?.epoch!==this.scope.epoch) return unavailable;
   const key=`${this.scope.epoch}:${this.scope.environment}:${this.scope.population}:${period}:${from.toISOString()}`;
   const row=await tx.measurementRollup.findUnique({where:{key}});
   if(!row || row.epoch!==this.scope.epoch || row.expiresAt<=this.now() || this.now().getTime()-row.generatedAt.getTime()>5*60_000) return unavailable;
   const parsed=ImprovementSchemas.ImprovementSnapshotSchema.safeParse(row.metrics);
   if(!parsed.success || parsed.data.environment!==this.scope.environment || parsed.data.population!==this.scope.population || parsed.data.period!==period) return unavailable;
   return parsed.data;
  });
 }
 async investigate(subject:StaffSubject,input:unknown) {
  const parsed=ImprovementSchemas.ImprovementInvestigationRequestSchema.safeParse(input);
  if(!parsed.success) throw new ImprovementAccessDenied("Reason and bounded period required");
  const {from,to}=this.window(parsed.data.period);
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.investigate"},tx);
   const states=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
   if(!this.scope.epoch || states[0]?.epoch!==this.scope.epoch) throw new ImprovementAccessDenied("Collector unavailable");
   const now=this.now(),expiresAt=new Date(now.getTime()+3_600_000),id=randomUUID();
   // The audit write must succeed in the same transaction before any detailed result leaves this boundary.
   const audit=await tx.auditLog.create({data:{actorId:subject.userId,action:"analytics.investigate",targetType:"measurement_window",targetId:id,details:{reason:parsed.data.reason,period:parsed.data.period,windowFrom:from.toISOString(),windowTo:to.toISOString()}}});
   const rows=await tx.measurementRecord.findMany({where:{environment:this.scope.environment,population:this.scope.population,occurredAt:{gte:from,lt:to},expiresAt:{gt:now},principal:{epoch:this.scope.epoch}},orderBy:[{occurredAt:"asc"},{id:"asc"}],take:100});
   const labels=new Map<string,string>();
   const events:ImprovementSchemas.ImprovementTimeline["events"]=[];
   for(const row of rows) {
    const event=MeasurementSchemas.MeasurementEventSchema.safeParse(row.event);
    if(!event.success) continue;
    const subjectLabel=labels.get(row.principalId)??`person_${labels.size+1}`;labels.set(row.principalId,subjectLabel);
    const result="result" in event.data.payload?event.data.payload.result:undefined;
    events.push({at:event.data.occurredAt,subject:subjectLabel,eventName:event.data.eventName,platform:event.data.context.platform,release:event.data.context.release,
     ...(result==="success"||result==="expected_rejection"||result==="technical_failure"||result==="cancelled"?{result}:{}),});
   }
   const evidence:ImprovementSchemas.ImprovementTimeline={generatedAt:now.toISOString(),expiresAt:expiresAt.toISOString(),reason:parsed.data.reason,events};
   await tx.measurementInvestigationExport.create({data:{id,actorId:subject.userId,sessionId:subject.sessionId,epoch:this.scope.epoch,reason:parsed.data.reason,auditId:audit.id,scope:{kind:"improvement",period:parsed.data.period},evidence:JSON.parse(JSON.stringify(evidence)),expiresAt}});
   return {id,expiresAt:expiresAt.toISOString()};
  });
 }
 async artifact(subject:StaffSubject,id:string) {
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.investigate"},tx);
   const states=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
   const row=await tx.measurementInvestigationExport.findUnique({where:{id}});
   if(!row || row.actorId!==subject.userId || row.sessionId!==subject.sessionId || row.epoch!==this.scope.epoch || states[0]?.epoch!==this.scope.epoch || row.expiresAt<=this.now() || row.revokedAt) throw new ImprovementAccessDenied("Artifact unavailable");
   if(typeof row.scope!=="object" || row.scope===null || Array.isArray(row.scope) || row.scope["kind"]!=="improvement") throw new ImprovementAccessDenied("Artifact unavailable");
   const evidence=ImprovementSchemas.ImprovementTimelineSchema.safeParse(row.evidence);
   if(!evidence.success) throw new ImprovementAccessDenied("Artifact unavailable");
   await tx.auditLog.create({data:{actorId:subject.userId,action:"analytics.investigate.artifact",targetType:"measurement_export",targetId:id,details:{reason:row.reason}}});
   return evidence.data;
  });
 }
}
