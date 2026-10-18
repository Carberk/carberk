import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,beforeEach,describe,it,expect } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { PrismaMeasurementCommit } from "../../measurement/infrastructure/PrismaMeasurementCommit";
import { cleanSuiteFixtures,defineE2eSuite,seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import { MessageAlreadySavedError } from "../domain/ports/ConversationRepository";
import { PrismaConversationRepository } from "./PrismaConversationRepository";

const suite=defineE2eSuite("conversation-source-917"),epoch=suite.id("epoch"),buyer=suite.id("buyer"),seller=suite.id("seller"),conversationId=suite.id("conversation"),listingId=suite.id("listing"),at=new Date("2026-10-18T12:00:00Z");
describe("canonical Conversation facts in real PostgreSQL source transactions",()=>{
 let db:PrismaService,repo:PrismaConversationRepository,capture:PrismaMeasurementCommit;
 async function cleanup(){if(!db)return;await db.measurementPrincipal.deleteMany({where:{epoch}});await db.measurementState.deleteMany({where:{key:"collector",epoch}});await cleanSuiteFixtures(db,suite,{userAliases:["buyer","seller"]});}
 beforeAll(async()=>{db=new PrismaService();await db.$connect();capture=new PrismaMeasurementCommit({enabled:true,environment:"test",purposes:["product_improvement"],evidenceRef:"synthetic-conversation-917",realCollectionApproved:false},epoch);repo=new PrismaConversationRepository(db,undefined,capture);});
 beforeEach(async()=>{await cleanup();const catalog=await seedSuiteCatalog(db,suite);for(const id of [buyer,seller]){await db.user.create({data:{id,phone:suite.phone(id===buyer?"buyer":"seller"),phoneVerifiedAt:new Date()}});await db.measurementPrincipal.create({data:{userId:id,pseudonym:randomUUID().replaceAll("-","").repeat(2),generation:randomUUID(),epoch,kind:"account"}});}await db.measurementState.create({data:{key:"collector",epoch}});await db.listing.create({data:{id:listingId,sellerId:seller,brandId:catalog.brandId,modelId:catalog.modelId,cityId:catalog.cityId,status:"active",priceAmount:1000,priceCurrency:"TMT"}});});
 afterAll(async()=>{await cleanup();await db.$disconnect();});
 const conversation=()=>Conversation.create({id:conversationId,listingId,buyerId:buyer,sellerId:seller,createdAt:at});
 const message=(id:string,senderId=buyer,createdAt=at,clientMessageId?:string)=>Message.createText({id,conversationId,senderId,text:"PRIVATE source body",createdAt,clientMessageId});
 async function facts(){return (await db.measurementOutbox.findMany({where:{epoch},orderBy:{createdAt:"asc"}})).map(row=>row.event);}
 it("keeps original accepted buyer/reply references when equal-time later UUIDs sort earlier",async()=>{
  await repo.save(conversation());const buyerIds=[suite.id("buyer-a"),suite.id("buyer-b")].sort(),replyIds=[suite.id("reply-a"),suite.id("reply-b")].sort();
  await repo.saveMessage(message(buyerIds[1]!));await repo.saveMessage(message(buyerIds[0]!));
  await repo.saveMessage(message(replyIds[1]!,seller,new Date(at.getTime()+1000)));await repo.saveMessage(message(replyIds[0]!,seller,new Date(at.getTime()+1000)));
  const outcomes=await facts();expect(outcomes).toHaveLength(3);expect(outcomes).toEqual(expect.arrayContaining([expect.objectContaining({eventName:"first_buyer_message_accepted",payload:expect.objectContaining({messageId:buyerIds[1]})}),expect.objectContaining({eventName:"seller_first_reply",payload:expect.objectContaining({firstBuyerMessageId:buyerIds[1],replyMessageId:replyIds[1],elapsedMs:1000})})]));expect(JSON.stringify(outcomes)).not.toContain("PRIVATE source body");
 });
 it("accepts one concurrent client retry and one first-message fact",async()=>{
  await repo.save(conversation());const client=suite.id("client-retry");const results=await Promise.allSettled([repo.saveMessage(message(suite.id("try-a"),buyer,at,client)),repo.saveMessage(message(suite.id("try-b"),buyer,at,client))]);expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.some(result=>result.status==="rejected"&&result.reason instanceof MessageAlreadySavedError)).toBe(true);expect((await repo.listMessages(conversationId,{})).items).toHaveLength(1);expect((await facts()).filter(event=>(event as {eventName:string}).eventName==="first_buyer_message_accepted")).toHaveLength(1);
 });
 it("rolls back the Conversation and source fact when commit fails after source work",async()=>{
  const failing=new Proxy(db,{get(target,key){if(key==="$transaction")return (work:(tx:object)=>Promise<unknown>)=>db.$transaction(async tx=>{await work(tx);throw new Error("synthetic commit failure");});const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
  await expect(new PrismaConversationRepository(failing,undefined,capture).save(conversation())).rejects.toThrow("synthetic commit failure");expect(await repo.findById(conversationId)).toBeNull();expect(await facts()).toEqual([]);
 });
 it("does not manufacture a new first cohort from legacy Messages without accepted markers",async()=>{
  await repo.save(conversation());await db.message.create({data:{id:suite.id("legacy"),conversationId,senderId:buyer,kind:"text",body:"legacy",createdAt:at}});await repo.saveMessage(message(suite.id("new"),buyer,new Date(at.getTime()+1000)));await repo.saveMessage(message(suite.id("reply"),seller,new Date(at.getTime()+2000)));expect((await facts()).map(event=>(event as {eventName:string}).eventName)).toEqual(["conversation_created"]);
 });
});
