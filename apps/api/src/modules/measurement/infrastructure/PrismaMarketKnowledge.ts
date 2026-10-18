import { randomUUID } from "node:crypto";

import type { Prisma, PrismaService } from "@auto-tm/db";
import { z } from "zod";

import type { StaffAuthorityPort, StaffSubject } from "../../identity/identity.public";
import { qualifyAnonymousDataset, type AnonymousDataset, type KnowledgeSource } from "../domain/AnonymousMarketKnowledge";

const text=z.object({summary:z.string().min(1)}).strict();
const permission=z.object({status:z.enum(["permitted","unresolved","prohibited"])}).strict();
const strings=z.array(z.string());
const review=z.record(z.string(),z.string());
const data=z.object({synthetic:z.literal(true),destination:z.literal("internal_synthetic_research"),cells:z.array(z.record(z.string(),z.unknown()))}).strict();
const marketScope=z.object({kind:z.literal("market_knowledge"),datasetId:z.string().min(1)}).strict();
export class MarketKnowledgeDenied extends Error {}

/** Every read requalifies current sources and the external collector epoch, including known artifacts. */
export class PrismaMarketKnowledge {
 constructor(private readonly prisma:PrismaService,private readonly authority:StaffAuthorityPort,private readonly epoch:string,private readonly now:()=>Date=()=>new Date()) {}
 private async current(tx:Prisma.TransactionClient,id:string) {
  const state=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
  if(!this.epoch || state[0]?.epoch!==this.epoch) return {state:"invalidated" as const,reason:"epoch"};
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "market_knowledge_datasets" WHERE "id"=${id} FOR SHARE`;
  if(!rows.length) return {state:"unavailable" as const};
  const row=await tx.marketKnowledgeDataset.findUniqueOrThrow({where:{id},include:{sources:true}});
  if(row.invalidatedAt) return {state:"invalidated" as const,reason:"source"};
  if(row.expiresAt && row.expiresAt<=this.now()) return {state:"invalidated" as const,reason:"expired"};
  const fences=row.sources;
  // Lock in stable order so source revocation and derivation have one serialization point.
  const sources:KnowledgeSource[]=[];
  for(const fence of [...fences].sort((a,b)=>a.sourceId.localeCompare(b.sourceId))) {
   await tx.$queryRaw`SELECT "id" FROM "market_knowledge_sources" WHERE "id"=${fence.sourceId} FOR SHARE`;
   const source=await tx.marketKnowledgeSource.findUnique({where:{id:fence.sourceId}});
   if(!source) return {state:"invalidated" as const,reason:"source"};
   const provenance=text.safeParse(source.provenance),purposes=strings.safeParse(source.purposes),reuse=permission.safeParse(source.reuseRights),redistribution=permission.safeParse(source.redistributionRights),assessment=review.safeParse(source.identifiabilityReview),destinations=strings.safeParse(source.destinations);
   const access=z.object({audience:z.literal("analytics.aggregate")}).strict().safeParse(source.accessPolicy);
   if(!provenance.success || !purposes.success || !reuse.success || !redistribution.success || !assessment.success || !destinations.success || !access.success) return {state:"quarantined" as const,reason:"rights"};
   sources.push({id:source.id,version:source.version,epoch:source.epoch,status:source.status,provenance:provenance.data.summary,
    purpose:purposes.data.includes("synthetic_research")?"synthetic_research":"unresolved",reuse:reuse.data.status,redistribution:redistribution.data.status,
    retentionBasis:source.retentionBasis,expiresAt:source.expiresAt,deletedAt:source.revokedAt,review:assessment.data,destinations:destinations.data});
  }
  const contents=data.safeParse(row.data),assessment=review.safeParse(row.review);
  if(!contents.success || !assessment.success || row.status!=="qualified") return {state:"quarantined" as const,reason:"schema"};
  const dataset:AnonymousDataset={id:row.id,version:row.version,epoch:row.epoch,derivationVersion:row.derivationVersion,
   ...contents.data,review:assessment.data,sourceFences:fences.map(fence=>({id:fence.sourceId,version:fence.sourceVersion,epoch:fence.sourceEpoch}))};
  const qualification=qualifyAnonymousDataset(dataset,sources,{epoch:this.epoch,now:this.now()});
  return qualification.state==="qualified"?{...qualification,dataset:{id:row.id,version:row.version,derivationVersion:row.derivationVersion,cells:contents.data.cells}}:qualification;
 }
 async list(subject:StaffSubject) {
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.aggregate"},tx);
   const rows=await tx.marketKnowledgeDataset.findMany({where:{epoch:this.epoch},select:{id:true},orderBy:{id:"asc"},take:20});
   const result=[];
   for(const row of rows)result.push(await this.current(tx,row.id));
   return result;
  });
 }
 async read(subject:StaffSubject,id:string) {
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.aggregate"},tx);
   return this.current(tx,id);
  });
 }
 async export(subject:StaffSubject,id:string,reason:string) {
  if(reason.trim().length<8 || reason.length>500) throw new MarketKnowledgeDenied("Reason required");
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.investigate"},tx);
   const current=await this.current(tx,id);
   if(current.state!=="qualified") throw new MarketKnowledgeDenied("Dataset is not qualified");
   const artifactId=randomUUID(),now=this.now(),expiresAt=new Date(now.getTime()+3_600_000);
   const audit=await tx.auditLog.create({data:{actorId:subject.userId,action:"analytics.synthetic_research.export",targetType:"market_knowledge_dataset",targetId:id,details:{reason:reason.trim(),artifactId}}});
   await tx.measurementInvestigationExport.create({data:{id:artifactId,actorId:subject.userId,sessionId:subject.sessionId,epoch:this.epoch,reason:reason.trim(),auditId:audit.id,scope:{kind:"market_knowledge",datasetId:id},evidence:{datasetVersion:current.dataset.version},expiresAt}});
   return {id:artifactId,expiresAt:expiresAt.toISOString()};
  });
 }
 async artifact(subject:StaffSubject,id:string) {
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.investigate"},tx);
   const artifact=await tx.measurementInvestigationExport.findUnique({where:{id}});
   if(!artifact || artifact.actorId!==subject.userId || artifact.sessionId!==subject.sessionId || artifact.epoch!==this.epoch || artifact.expiresAt<=this.now() || artifact.revokedAt) throw new MarketKnowledgeDenied("Artifact unavailable");
   const scope=marketScope.safeParse(artifact.scope);
   if(!scope.success) throw new MarketKnowledgeDenied("Artifact unavailable");
   const current=await this.current(tx,scope.data.datasetId);
   const version=z.object({datasetVersion:z.number().int()}).strict().safeParse(artifact.evidence);
   if(current.state!=="qualified" || !version.success || version.data.datasetVersion!==current.dataset.version) throw new MarketKnowledgeDenied("Source changed");
   await tx.auditLog.create({data:{actorId:subject.userId,action:"analytics.synthetic_research.artifact",targetType:"measurement_export",targetId:id,details:{reason:artifact.reason}}});
   return current;
  });
 }
}
