import { randomUUID } from "node:crypto";

import type { Prisma, PrismaService } from "@auto-tm/db";
import { z } from "zod";

import type { StaffAuthorityPort, StaffSubject } from "../../identity/identity.public";
import { deriveSyntheticMarketCells, qualifyAnonymousDataset, type AnonymousDataset, type KnowledgeSource } from "../domain/AnonymousMarketKnowledge";

import { marketReleaseDigest } from "./MarketReleaseDigest";

const text=z.object({summary:z.string().min(1)}).strict();
const permission=z.object({status:z.enum(["permitted","unresolved","prohibited"])}).strict();
const strings=z.array(z.string());
const review=z.record(z.string(),z.string());
const releaseSchema=z.object({policy:z.literal("fixed-month-v1"),period:z.string().regex(/^20[0-9]{2}-(0[1-9]|1[0-2])$/),suppressedCells:z.number().int().nonnegative()}).strict();
const data=z.object({release:releaseSchema,synthetic:z.literal(true),destination:z.literal("internal_synthetic_research"),cells:z.array(z.record(z.string(),z.unknown()))}).strict();
const marketScope=z.object({kind:z.literal("market_knowledge"),datasetId:z.string().min(1)}).strict();
export class MarketKnowledgeDenied extends Error {}

/** Every read requalifies current sources and the external collector epoch, including known artifacts. */
export class PrismaMarketKnowledge {
 constructor(private readonly prisma:PrismaService,private readonly authority:StaffAuthorityPort,private readonly epoch:string,private readonly now:()=>Date=()=>new Date()) {}
 private async sources(tx:Prisma.TransactionClient,fences:readonly {sourceId:string}[]) {
  // Lock in stable order so source revocation and derivation have one serialization point.
  if(fences.length<1 || fences.length>20)return null;
  const sources:KnowledgeSource[]=[];
  for(const fence of [...fences].sort((a,b)=>a.sourceId.localeCompare(b.sourceId))) {
   await tx.$queryRaw`SELECT "id" FROM "market_knowledge_sources" WHERE "id"=${fence.sourceId} FOR SHARE`;
   const source=await tx.marketKnowledgeSource.findUnique({where:{id:fence.sourceId}});
   if(!source) return null;
   const provenance=text.safeParse(source.provenance),purposes=strings.safeParse(source.purposes),reuse=permission.safeParse(source.reuseRights),redistribution=permission.safeParse(source.redistributionRights),assessment=review.safeParse(source.identifiabilityReview),destinations=strings.safeParse(source.destinations);
   const restrictions=z.record(z.string(),z.unknown()).safeParse(source.restrictions);
   const access=z.object({audience:z.literal("analytics.aggregate")}).strict().safeParse(source.accessPolicy);
   if(!provenance.success || !purposes.success || !reuse.success || !redistribution.success || !assessment.success || !destinations.success || !access.success || !restrictions.success) return null;
   sources.push({id:source.id,version:source.version,epoch:source.epoch,status:source.status,provenance:provenance.data.summary,
    purpose:purposes.data.includes("synthetic_research")?"synthetic_research":"unresolved",reuse:reuse.data.status,redistribution:redistribution.data.status,
    retentionBasis:source.retentionBasis,expiresAt:source.expiresAt,deletedAt:source.revokedAt,restrictions:restrictions.data,review:assessment.data,destinations:destinations.data});
  }
  return sources;
 }
 private async current(tx:Prisma.TransactionClient,id:string) {
  const state=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
  if(!this.epoch || state[0]?.epoch!==this.epoch) return {state:"invalidated" as const,reason:"epoch"};
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "market_knowledge_datasets" WHERE "id"=${id} FOR SHARE`;
  if(!rows.length) return {state:"unavailable" as const};
  const row=await tx.marketKnowledgeDataset.findUniqueOrThrow({where:{id},include:{sources:true}});
  if(row.invalidatedAt) return {state:"invalidated" as const,reason:"source"};
  if(row.expiresAt && row.expiresAt<=this.now()) return {state:"invalidated" as const,reason:"expired"};
  const fences=row.sources;
  const sources=await this.sources(tx,fences);
  if(!sources)return {state:"quarantined" as const,reason:"rights"};
  const contents=data.safeParse(row.data),assessment=review.safeParse(row.review);
  if(!contents.success || !assessment.success || row.status!=="qualified") return {state:"quarantined" as const,reason:"schema"};
  const fixed=await tx.measurementState.findUnique({where:{key:`market_release:TM:${contents.data.release.period}`}});
  const releasedDigest=marketReleaseDigest({cells:contents.data.cells,fences:[...fences].sort((a,b)=>a.sourceId.localeCompare(b.sourceId)).map(fence=>({id:fence.sourceId,version:fence.sourceVersion,epoch:fence.sourceEpoch})),epoch:row.epoch});
  if(fixed?.epoch!==releasedDigest || row.id!==`synthetic-tm-${contents.data.release.period}` || contents.data.cells.some(cell=>cell["period"]!==contents.data.release.period || typeof cell["observations"]!=="number" || cell["observations"]<10 || cell["observations"]%5!==0))return {state:"quarantined" as const,reason:"release"};
  const dataset:AnonymousDataset={id:row.id,version:row.version,epoch:row.epoch,derivationVersion:row.derivationVersion,
   ...contents.data,review:assessment.data,sourceFences:fences.map(fence=>({id:fence.sourceId,version:fence.sourceVersion,epoch:fence.sourceEpoch}))};
  const qualification=qualifyAnonymousDataset(dataset,sources,{epoch:this.epoch,now:this.now()});
  const expiresAt=[row.expiresAt,...sources.map(source=>source.expiresAt)].filter((value):value is Date=>value!==null).sort((a,b)=>a.getTime()-b.getTime())[0]??null;
  return qualification.state==="qualified"?{...qualification,dataset:{id:row.id,version:row.version,derivationVersion:row.derivationVersion,retentionClass:expiresAt?"qualified_expiring" as const:"qualified_indefinite" as const,expiresAt:expiresAt?.toISOString()??null,sources:sources.map(source=>({id:source.id,version:source.version,provenance:source.provenance,retentionBasis:source.retentionBasis})),cells:contents.data.cells}}:qualification;
 }
 /** Synthetic reviewed aggregate input only. No raw source records or personal demographics enter this interface. */
 async admitSynthetic(subject:StaffSubject,input:unknown) {
  const parsed=z.object({expectedEpoch:z.string().min(1),sourceFences:z.array(z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),version:z.number().int().positive(),epoch:z.string().min(1)}).strict()).min(1).max(20),review,cells:z.array(z.unknown()).min(1).max(1000),reason:z.string().trim().min(8).max(500)}).strict().safeParse(input);
  if(!parsed.success)throw new MarketKnowledgeDenied("Invalid synthetic admission");
  const derived=deriveSyntheticMarketCells(parsed.data.cells);
  if(derived.state!=="ready" || !derived.cells.length)throw new MarketKnowledgeDenied("No safe synthetic cells");
  const id=`synthetic-tm-${derived.period}`,releaseKey=`market_release:TM:${derived.period}`;
  const sourceFences=[...parsed.data.sourceFences].sort((a,b)=>a.id.localeCompare(b.id));
  const digest=marketReleaseDigest({cells:derived.cells,fences:sourceFences,epoch:parsed.data.expectedEpoch});
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.investigate"},tx);
   const collector=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR SHARE`;
   if(!this.epoch || parsed.data.expectedEpoch!==this.epoch || collector[0]?.epoch!==this.epoch)throw new MarketKnowledgeDenied("Stale synthetic derivation");
   // A retained fixed-month fence prevents a second overlapping release, including after source invalidation or restore.
   await tx.measurementState.upsert({where:{key:releaseKey},create:{key:releaseKey,epoch:digest},update:{}});
   const release=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"=${releaseKey} FOR UPDATE`;
   if(release[0]?.epoch!==digest)throw new MarketKnowledgeDenied("Monthly release already fixed");
   const sources=await this.sources(tx,sourceFences.map(fence=>({sourceId:fence.id})));
   if(!sources)throw new MarketKnowledgeDenied("Source rights unresolved");
   const dataset:AnonymousDataset={id,version:1,epoch:this.epoch,derivationVersion:"tm-market-cells-v1",synthetic:true,destination:"internal_synthetic_research",sourceFences,review:parsed.data.review,cells:derived.cells};
   if(qualifyAnonymousDataset(dataset,sources,{epoch:this.epoch,now:this.now()}).state!=="qualified")throw new MarketKnowledgeDenied("Source or anonymity qualification failed");
   const previous=await tx.marketKnowledgeDataset.findUnique({where:{id}});
   if(previous) {
    const current=await this.current(tx,id);
    if(current.state!=="qualified")throw new MarketKnowledgeDenied("Released dataset invalidated");
    return current;
   }
   const expiry=sources.flatMap(source=>source.expiresAt?[source.expiresAt]:[]).sort((a,b)=>a.getTime()-b.getTime())[0]??null;
   await tx.auditLog.create({data:{actorId:subject.userId,action:"analytics.synthetic_research.admit",targetType:"market_knowledge_dataset",targetId:id,details:{reason:parsed.data.reason,sourceFences,policy:"fixed-month-v1"}}});
   await tx.marketKnowledgeDataset.create({data:{id,version:1,epoch:this.epoch,derivationVersion:dataset.derivationVersion,status:"qualified",review:parsed.data.review,
    expiresAt:expiry,data:{synthetic:true,destination:dataset.destination,release:{policy:"fixed-month-v1",period:derived.period,suppressedCells:derived.suppressedCells},cells:derived.cells},
    sources:{create:sourceFences.map(fence=>({sourceId:fence.id,sourceVersion:fence.version,sourceEpoch:fence.epoch}))}}});
   return this.current(tx,id);
  });
 }
 /** Registry deletion is a retained source fence. Derived cells and known artifacts are invalidated atomically. */
 async invalidateSource(subject:StaffSubject,id:string,input:unknown) {
  const parsed=z.object({expectedEpoch:z.string().min(1),expectedVersion:z.number().int().positive(),action:z.enum(["delete","restrict"]),reason:z.string().trim().min(8).max(500)}).strict().safeParse(input);
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !parsed.success)throw new MarketKnowledgeDenied("Invalid source lifecycle request");
  return this.prisma.$transaction(async tx=>{
   await this.authority.authorize({...subject,capability:"analytics.investigate"},tx);
   // Exclusive collector lock precedes source/dataset locks, while readers take its shared lock first.
   const collector=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR UPDATE`;
   if(!this.epoch || parsed.data.expectedEpoch!==this.epoch || collector[0]?.epoch!==this.epoch)throw new MarketKnowledgeDenied("Stale source lifecycle epoch");
   await tx.$queryRaw`SELECT "id" FROM "market_knowledge_sources" WHERE "id"=${id} FOR UPDATE`;
   const source=await tx.marketKnowledgeSource.findUnique({where:{id}});
   if(!source || source.epoch!==this.epoch || source.version!==parsed.data.expectedVersion || source.revokedAt)throw new MarketKnowledgeDenied("Stale source lifecycle version");
   const links=await tx.marketKnowledgeDatasetSource.findMany({where:{sourceId:id},select:{datasetId:true},take:1001});
   if(links.length>1000)throw new MarketKnowledgeDenied("Source lifecycle requires bounded operator batches");
   const datasetIds=links.map(link=>link.datasetId),now=this.now();
   await tx.marketKnowledgeSource.update({where:{id},data:{status:parsed.data.action==="delete"?"deleted":"restricted",version:{increment:1},revokedAt:now}});
   await tx.marketKnowledgeDataset.updateMany({where:{id:{in:datasetIds}},data:{status:"invalidated",invalidatedAt:now,data:{}}});
   await tx.measurementInvestigationExport.updateMany({where:{epoch:this.epoch,revokedAt:null,AND:[{scope:{path:["kind"],equals:"market_knowledge"}},{OR:datasetIds.map(datasetId=>({scope:{path:["datasetId"],equals:datasetId}}))}]},data:{revokedAt:now}});
   await tx.auditLog.create({data:{actorId:subject.userId,action:`analytics.synthetic_research.source.${parsed.data.action}`,targetType:"market_knowledge_source",targetId:id,details:{reason:parsed.data.reason,expectedVersion:parsed.data.expectedVersion,newVersion:source.version+1,datasetIds}}});
   return {id,version:source.version+1,state:"invalidated" as const};
  });
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
