import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { FastifyAdapter,type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "@auto-tm/db";
import { beforeAll,beforeEach,afterAll,describe,it,expect } from "vitest";
import supertest from "supertest";

import { IdentityModule } from "../../identity/identity.module";
import { hash } from "bcryptjs";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures,defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { eventually } from "../../../../test/helpers/eventually";
import { AcceptMeasurement } from "../application/AcceptMeasurement";
import { RecordSignInMeasurement } from "../application/RecordSignInMeasurement";
import { PrismaMeasurementStore } from "../infrastructure/PrismaMeasurementStore";
import { MEASUREMENT_SIGN_IN_OUTCOME_PORT } from "../measurement.public";

const suite=defineE2eSuite("sign-in-source-917"),epoch=suite.id("epoch"),phone=suite.phone("member"),code="333333";
describe("real sign-in HTTP outcomes and durable measurement",()=>{
 let db:PrismaService,app:NestFastifyApplication,request:ReturnType<typeof supertest>,store:PrismaMeasurementStore,guest:string;
 async function cleanup(){if(!db)return;await db.otpRequest.deleteMany({where:{destination:phone}});await db.measurementPrincipal.deleteMany({where:{epoch}});await db.measurementState.deleteMany({where:{key:"collector",epoch}});await cleanSuiteFixtures(db,suite,{userAliases:["member"]});}
 beforeAll(async()=>{
  db=new PrismaService();await db.$connect();store=new PrismaMeasurementStore(db,{epoch,environment:"test",population:"synthetic"});
  const source=new RecordSignInMeasurement(store,new AcceptMeasurement(store,()=>new Date(),{enabled:true,environment:"test",purposes:["product_reliability"],evidenceRef:"synthetic-auth-source-917",realCollectionApproved:false}),()=>new Date());
  const module=await Test.createTestingModule({imports:[bullTestRoot(),IdentityModule,JwtModule.register({global:true,secret:"synthetic-auth-source-917"})]}).overrideProvider(MEASUREMENT_SIGN_IN_OUTCOME_PORT).useValue(source).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());app.useGlobalFilters(new GlobalErrorFilter());await app.listen(0,"127.0.0.1");request=supertest(app.getHttpServer());
 });
 beforeEach(async()=>{
  await cleanup();await db.user.create({data:{id:suite.id("member"),phone,phoneVerifiedAt:new Date()}});await db.measurementState.create({data:{key:"collector",epoch}});
  await db.otpRequest.create({data:{id:suite.id("otp"),purpose:"sign_in",channel:"phone",destination:phone,phone,codeHash:await hash(code,10),expiresAt:new Date(Date.now()+60000),ip:"127.0.0.1"}});
  const admission=await store.bootstrap({});if(!admission?.guestCapability)throw new Error("Missing synthetic guest");guest=admission.guestCapability;
 });
 afterAll(async()=>{await cleanup();await app?.close();await db.$disconnect();});
 it("records canonical rejection and success once per opaque attempt without the destination or code",async()=>{
  const verify=(attempt:string,value:string)=>request.post("/api/v1/auth/otp/verify").set("X-Measurement-Attempt",attempt).set("X-Measurement-Guest",guest).send({phone,code:value});
  await verify(suite.id("rejection"),"444444").expect(400);await verify(suite.id("rejection"),"444444").expect(400);
  const signedIn=await verify(suite.id("success"),code).expect(201);expect(signedIn.body.user.id).toBe(suite.id("member"));expect(signedIn.body.accessToken).toBeTypeOf("string");
  const rows=await eventually(async()=>{const rows=await db.measurementRecord.findMany({where:{id:{in:[suite.id("rejection"),suite.id("success")]}}});return rows.length===2?rows:null;},{description:"both canonical sign-in outcomes"});
  expect(rows.map(row=>row.event)).toEqual(expect.arrayContaining([expect.objectContaining({eventId:suite.id("rejection"),eventName:"sign_in_result",payload:expect.objectContaining({attemptId:suite.id("rejection"),result:"expected_rejection",category:"validation"})}),expect.objectContaining({eventId:suite.id("success"),eventName:"sign_in_result",payload:expect.objectContaining({attemptId:suite.id("success"),result:"success"})})]));
  expect(JSON.stringify(rows.map(row=>row.event))).not.toContain(phone);expect(JSON.stringify(rows.map(row=>row.event))).not.toContain(code);
 });
});
