import "reflect-metadata";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { JwtModule,JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { FastifyAdapter,type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import supertest from "supertest";

import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IdentityModule } from "../../identity/identity.module";
import { STAFF_AUTHORITY_PORT,type StaffAuthorityPort } from "../../identity/identity.public";
import { ListingMeasurementModule } from "../../listings/listing-measurement.module";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures,defineE2eSuite,seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { PrismaMeasurementStore } from "../infrastructure/PrismaMeasurementStore";
import { AcceptMeasurement } from "../application/AcceptMeasurement";
import { MEASUREMENT_CONVERSION_PORT,type MeasurementConversionPort } from "../measurement.public";
import { PrismaImprovementRead } from "../infrastructure/PrismaImprovementRead";
import { PrismaMarketKnowledge } from "../infrastructure/PrismaMarketKnowledge";

import { ImprovementController } from "./ImprovementController";

const suite=defineE2eSuite("improvement-917-918"),DAY=86400000,epoch=suite.id("collector-epoch");
const users=["investigator","viewer","ordinary",...Array.from({length:12},(_,index)=>`buyer-${index}`)];
describe("authorized Improvement HTTP and real worker/PostgreSQL snapshots",()=>{
 let app:NestFastifyApplication,prisma:PrismaService,request:ReturnType<typeof supertest>,jwt:JwtService,authority:StaffAuthorityPort;
 let now:Date,clock:Date,store:PrismaMeasurementStore,sequence=0;
 const token=(who:string)=>jwt.sign({sub:suite.id(who),sid:suite.id(`${who}-session`),role:"buyer"});
 const get=(path:string,who="investigator")=>request.get(`/api/v1/improvement/${path}`).set("Authorization",`Bearer ${token(who)}`);
 async function cleanup() {
  if(!prisma)return;
  await prisma.marketKnowledgeDataset.deleteMany({where:{id:"synthetic-tm-2001-10"}});
  await prisma.marketKnowledgeSource.deleteMany({where:{id:suite.slugFor("market-source")}});
  await prisma.measurementInvestigationExport.deleteMany({where:{actorId:{in:users.map(user=>suite.id(user))}}});
  await prisma.measurementRollup.deleteMany({where:{epoch}});
  await prisma.measurementPrincipal.deleteMany({where:{epoch}});
  await prisma.auditLog.deleteMany({where:{actorId:{in:users.map(user=>suite.id(user))}}});
  await prisma.measurementState.deleteMany({where:{key:{in:["collector",`inventory_baseline:${epoch}`,"market_release:TM:2001-10"]}}});
  await cleanSuiteFixtures(prisma,suite,{userAliases:users});
 }
 beforeAll(async()=>{
  const module=await Test.createTestingModule({imports:[bullTestRoot(),IdentityModule,ListingMeasurementModule,JwtModule.register({global:true,secret:"synthetic-improvement-917"})],controllers:[ImprovementController],providers:[
   {provide:PrismaImprovementRead,inject:[PrismaService,STAFF_AUTHORITY_PORT],useFactory:(db:PrismaService,staff:StaffAuthorityPort)=>new PrismaImprovementRead(db,staff,{epoch,environment:"test",population:"synthetic"},()=>now)},
   {provide:PrismaMarketKnowledge,inject:[PrismaService,STAFF_AUTHORITY_PORT],useFactory:(db:PrismaService,staff:StaffAuthorityPort)=>new PrismaMarketKnowledge(db,staff,epoch,()=>now)},
  ]}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());prisma=app.get(PrismaService);jwt=app.get(JwtService);authority=app.get(STAFF_AUTHORITY_PORT);
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector),jwt));await app.listen(0,"127.0.0.1");request=supertest(app.getHttpServer());
 });
 beforeEach(async()=>{
  await cleanup();now=new Date();clock=new Date(now);sequence=0;
  await seedSuiteCatalog(prisma,suite);
  for(const who of users) {
   await prisma.user.create({data:{id:suite.id(who),role:who==="ordinary"?"admin":"buyer",phone:suite.phone(who)}});
   await prisma.session.create({data:{id:suite.id(`${who}-session`),userId:suite.id(who),refreshTokenHash:suite.id(`${who}-refresh`),expiresAt:new Date(Date.now()+DAY),adminTotpExpiresAt:new Date(Date.now()+DAY)}});
  }
  await prisma.staffGrant.createMany({data:[{userId:suite.id("viewer"),capability:"analytics.aggregate"},{userId:suite.id("investigator"),capability:"analytics.aggregate"},{userId:suite.id("investigator"),capability:"analytics.investigate"}]});
  await prisma.measurementState.create({data:{key:"collector",epoch}});
  store=new PrismaMeasurementStore(prisma,{epoch,environment:"test",population:"synthetic"},()=>clock,app.get<MeasurementConversionPort>(MEASUREMENT_CONVERSION_PORT));
 });
 afterAll(async()=>{await cleanup();await app?.close();});
 async function fact(who:string,eventName:string,payload:object,time:Date) {
  clock=time;const boot=await store.bootstrap({authenticatedUserId:suite.id(who)}),resolved=await store.resolve({authenticatedUserId:suite.id(who)});
  if(!boot || !resolved)throw new Error("Synthetic principal missing");
  const origin:"client"|"server"=eventName==="call_intent"?"client":"server";
  const event={version:1,eventId:suite.id(`event-${sequence++}`),visitId:boot.visitId,occurredAt:time.toISOString(),purpose:"product_improvement",eventName,context:{platform:origin==="server"?"server":"android",release:"1.0",build:"1",locale:"en"},payload} as MeasurementSchemas.MeasurementEvent;
  const accept=new AcceptMeasurement(store,()=>clock,{enabled:true,environment:"test",purposes:["product_improvement","product_reliability"],evidenceRef:"synthetic-hosted-917",realCollectionApproved:false});
  expect(await accept.afterCommit(event,{...resolved,origin})).toBe("accepted");return {accept,event,authority:{...resolved,origin} as import("../measurement.public").MeasurementAuthority};
 }
 it("reproduces 16 / 12 through accepted owning facts, dedupe, worker persistence and actual HTTP",async()=>{
  const midnight=Math.floor(now.getTime()/DAY)*DAY,from=new Date(midnight-14*DAY),to=new Date(midnight-7*DAY);
  await prisma.measurementState.create({data:{key:`inventory_baseline:${epoch}`,epoch:from.toISOString()}});
  await prisma.listing.create({data:{id:suite.id("listing"),sellerId:suite.id("ordinary"),brandId:suite.catalog.brandId,modelId:suite.catalog.modelId,cityId:suite.catalog.cityId,status:"active",priceAmount:1000,priceCurrency:"TMT"}});
  for(let index=0;index<12;index++)await fact("ordinary","listing_visibility_changed",{listingId:suite.id(`active-${index}`),visibility:"public",reason:"published"},from);
  let duplicate:Awaited<ReturnType<typeof fact>>|undefined;
  for(let index=0;index<11;index++)duplicate=await fact(`buyer-${index}`,"call_intent",{listingId:suite.id("listing")},new Date(from.getTime()+3600000));
  await fact("ordinary","call_intent",{listingId:suite.id("listing")},new Date(from.getTime()+3600000));
  await fact("buyer-0","call_intent",{listingId:suite.id("listing")},new Date(from.getTime()+3600001));
  if(!duplicate)throw new Error("Call fixture missing");
  expect(await duplicate.accept.afterCommit(duplicate.event,duplicate.authority)).toBe("duplicate");
  for(let index=0;index<5;index++)await fact(`buyer-${index}`,"conversation_created",{conversationId:suite.id(`conversation-${index}`),listingId:suite.id("listing")},new Date(from.getTime()+7200000));
  for(let index=12;index<14;index++)await fact("ordinary","listing_visibility_changed",{listingId:suite.id(`active-${index}`),visibility:"public",reason:"published"},to);
  const workerPath=resolve(__dirname,"../../../../../worker/src/measurement/RecomputeImprovement.ts");
  const script=`import {PrismaService} from "@auto-tm/db";import {RecomputeImprovement} from ${JSON.stringify(workerPath)};async function main(){const db=new PrismaService();try{await db.$connect();await new RecomputeImprovement(db,{epoch:${JSON.stringify(epoch)},environment:"test",population:"synthetic"},()=>new Date(${JSON.stringify(now.toISOString())})).execute();}finally{await db.$disconnect();}}void main().catch(()=>{process.exitCode=1;});`;
  await promisify(execFile)("pnpm",["exec","tsx","--eval",script],{cwd:process.cwd(),env:process.env,timeout:30000});
  const result=await get("scorecard?period=previous_week").expect(200);
  expect(result.body.scorecard.contacts).toEqual({calls:11,conversations:5,total:16,perActiveListing:16/12});
  expect(result.body.scorecard.inventory).toMatchObject({averageActive:12,currentActive:14});
  expect(JSON.stringify(result.body)).not.toContain(suite.id("buyer-0"));
  await get("scorecard","ordinary").expect(403);
 });
 it("requires a reason, denies aggregate-only timelines and rechecks known artifacts after grant revocation and expiry",async()=>{
  const post=(who:string,body:object)=>request.post("/api/v1/improvement/investigations").set("Authorization",`Bearer ${token(who)}`).send(body);
  await post("viewer",{period:"today",reason:"Named synthetic investigation"}).expect(403);
  await post("investigator",{period:"today",reason:"short"}).expect(400);
  const receipt=(await post("investigator",{period:"today",reason:"Named synthetic investigation"}).expect(201)).body;
  expect((await get(`artifacts/${receipt.id}`).expect(200)).body.events).toEqual([]);
  await prisma.staffGrant.update({where:{userId_capability:{userId:suite.id("investigator"),capability:"analytics.investigate"}},data:{revokedAt:new Date()}});
  await get(`artifacts/${receipt.id}`).expect(403);
  await prisma.staffGrant.update({where:{userId_capability:{userId:suite.id("investigator"),capability:"analytics.investigate"}},data:{revokedAt:null}});
  now=new Date(now.getTime()+3600001);await get(`artifacts/${receipt.id}`).expect(403);
  expect(await prisma.auditLog.count({where:{actorId:suite.id("investigator"),action:"analytics.investigate"}})).toBe(1);
 });
 it("returns no detailed data or artifact when the real database refuses audit writes",async()=>{
  await prisma.$executeRaw`CREATE FUNCTION improvement_917_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit unavailable'; END $$`;
  await prisma.$executeRaw`CREATE TRIGGER improvement_917_refuse_audit BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION improvement_917_refuse_audit()`;
  try {
   await request.post("/api/v1/improvement/investigations").set("Authorization",`Bearer ${token("investigator")}`).send({period:"today",reason:"Named synthetic audit failure"}).expect(500);
   expect(await prisma.measurementInvestigationExport.count({where:{actorId:suite.id("investigator")}})).toBe(0);
  } finally {
   await prisma.$executeRaw`DROP TRIGGER improvement_917_refuse_audit ON "audit_logs"`;
   await prisma.$executeRaw`DROP FUNCTION improvement_917_refuse_audit()`;
  }
 });
 it("requalifies synthetic source rights on dataset and known export reads, including revocation and restored epochs",async()=>{
  const sourceId=suite.slugFor("market-source"),datasetId="synthetic-tm-2001-10";
  const review={singlingOut:"passed",linkage:"passed",rareVehicles:"passed",combinations:"passed",repeatedQueries:"passed"};
  await prisma.marketKnowledgeSource.create({data:{id:sourceId,version:1,epoch,status:"permitted",provenance:{summary:"Independent synthetic market fixture"},purposes:["synthetic_research"],reuseRights:{status:"permitted"},redistributionRights:{status:"unresolved"},restrictions:{syntheticOnly:true,retention:"indefinite",deletion:"invalidate_derivatives",export:"internal_synthetic_only",demographics:"synthetic_self_reported"},identifiabilityReview:review,destinations:["internal_synthetic_research"],accessPolicy:{audience:"analytics.aggregate"},retentionBasis:"Independent synthetic observations"}});
  const admission={expectedEpoch:epoch,sourceFences:[{id:sourceId,version:1,epoch}],review,reason:"Synthetic fixed monthly verification",cells:[{market:"TM",period:"2001-10",vehicleClass:"passenger",observations:32,priceBand:"15000_29999",ageBand:"unknown",residence:"unknown"},{market:"TM",period:"2001-10",vehicleClass:"commercial",observations:4,priceBand:"15000_29999"}]};
  const admit=(body:object,who="investigator")=>request.post("/api/v1/improvement/research/derivations").set("Authorization",`Bearer ${token(who)}`).send(body);
  await admit(admission,"viewer").expect(403);
  await prisma.marketKnowledgeSource.update({where:{id:sourceId},data:{restrictions:{syntheticOnly:true}}});
  await admit(admission).expect(403);
  expect(await prisma.marketKnowledgeDataset.findUnique({where:{id:datasetId}})).toBeNull();
  await prisma.marketKnowledgeSource.update({where:{id:sourceId},data:{restrictions:{syntheticOnly:true,retention:"indefinite",deletion:"invalidate_derivatives",export:"internal_synthetic_only",demographics:"synthetic_self_reported"}}});
  await admit({...admission,expectedEpoch:"stale-job"}).expect(403);
  const released=(await admit(admission).expect(201)).body;
  expect(released.dataset.cells).toEqual([{market:"TM",period:"2001-10",vehicleClass:"passenger",observations:30,priceBand:"15000_29999",ageBand:"unknown",residence:"unknown",demographicSource:"unknown"}]);
  expect((await admit(admission).expect(201)).body).toEqual(released);
  await admit({...admission,cells:[{...admission.cells[0],observations:37}]}).expect(403);
  // Combined filters and repeated requests cannot obtain totals or a second overlapping partition.
  expect((await get(`research/${datasetId}?ageBand=25_34&residence=TM-A`).expect(200)).body).toEqual(released);
  expect((await get(`research/${datasetId}?total=true`).expect(200)).body).toEqual(released);
  expect((await get(`research/${datasetId}`).expect(200)).body).toMatchObject({state:"qualified",commercialDisclosure:false});
  const artifact=(await request.post(`/api/v1/improvement/research/${datasetId}/exports`).set("Authorization",`Bearer ${token("investigator")}`).send({reason:"Synthetic rights verification"}).expect(201)).body;
  await get(`research-artifacts/${artifact.id}`).expect(200);
  await prisma.marketKnowledgeSource.update({where:{id:sourceId},data:{version:{increment:1},status:"revoked",revokedAt:now}});
  expect((await get(`research/${datasetId}`).expect(200)).body.state).toBe("invalidated");
  await get(`research-artifacts/${artifact.id}`).expect(403);
  await admit(admission).expect(403);
  await prisma.marketKnowledgeSource.update({where:{id:sourceId},data:{status:"permitted",revokedAt:null}});
  await admit({...admission,sourceFences:[{id:sourceId,version:2,epoch}]}).expect(403);
  await prisma.measurementState.update({where:{key:"collector"},data:{epoch:suite.id("restored-epoch")}});
  expect((await get(`research/${datasetId}`).expect(200)).body).toMatchObject({state:"invalidated",reason:"epoch"});
  await admit(admission).expect(403);
 });

});
