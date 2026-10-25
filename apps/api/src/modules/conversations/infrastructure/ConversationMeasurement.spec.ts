import { describe,expect,it } from "vitest";

import { FakeMeasurementCommit } from "../../measurement/application/testing/FakeMeasurementCommit";
import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";

import { PrismaConversationRepository } from "./PrismaConversationRepository";

// External database boundary only. Real repository, domain and emission port are exercised.
function database(options: { deletionScheduledAt?: Date; failMessage?: boolean } = {}) {
 let conversation:Record<string,unknown>|null=null;
 const messages:Record<string,unknown>[]=[];
 let prepared = false, userFenced = false;
 const tx={
  $queryRaw:async(parts: TemplateStringsArray, ...values: unknown[])=>{
   const sql = parts.join("?");
   if (sql.includes("campaign_prepare")) { prepared = true; return [{receipt:"00000000-0000-4000-8000-000000000001"}]; }
   if (sql.includes("campaign_finish")) { prepared = false; return []; }
   if (sql.includes("FOR UPDATE") && !prepared) throw new Error("lock_before_preparation");
   if (sql.includes('FROM "users"')) { userFenced = true; return [{ id: values[0], deletionScheduledAt: options.deletionScheduledAt ?? null }]; }
   if (sql.includes("FOR UPDATE") && !userFenced) throw new Error("user_fence_required");
   return [];
  },
  $executeRaw:async()=>0,
  conversation:{create:async({data}:{data:Record<string,unknown>})=>{if (!prepared || !userFenced) throw new Error("user_fence_required"); conversation={...data};return conversation;},
   findUnique:async()=>conversation,findUniqueOrThrow:async()=>conversation,update:async({data}:{data:Record<string,unknown>})=>{conversation={...conversation,...data};return conversation;}},
  conversationParticipant:{create:async()=>({})},
  message:{create:async({data}:{data:Record<string,unknown>})=>{if (!userFenced) throw new Error("user_fence_required"); if (options.failMessage) throw new Error("message_failed"); messages.push({...data});return data;},
   findUnique:async({where}:{where:{id:string}})=>messages.find(row=>row["id"]===where.id)??null,
   findFirst:async({where}:{where:{id?:{not:string};senderId?:string|{not:string};conversationId:string;createdAt?:{gte:Date}}})=>messages.filter(row=>row["conversationId"]===where.conversationId
    && (!where.id?.not||row["id"]!==where.id.not)
    && (typeof where.senderId==="string"?row["senderId"]===where.senderId:where.senderId?row["senderId"]!==where.senderId.not:true)
    && (!where.createdAt?.gte || (row["createdAt"] as Date)>=where.createdAt.gte)).sort((a,b)=>(a["createdAt"] as Date).getTime()-(b["createdAt"] as Date).getTime())[0]??null},
 };
 return {...tx, messages, $transaction:async(operation:((value:typeof tx)=>Promise<unknown>)|Promise<unknown>[])=>typeof operation==="function"?operation(tx):Promise.all(operation)};
}
const conversation=()=>Conversation.create({id:"conversation",listingId:"listing",buyerId:"buyer",sellerId:"seller",createdAt:new Date("2026-10-01T00:00:00Z")});
describe("canonical committed Conversation measurement",()=>{
 it("emits one new Conversation fact and one buyer/reply cohort without Message content",async()=>{
  const db=database(),measurement=new FakeMeasurementCommit();
  const repo=new PrismaConversationRepository(db as never,undefined,measurement);
  await repo.save(conversation());
  for(const [id,sender,time] of [["buyer-1","buyer","01"],["buyer-2","buyer","02"],["seller-1","seller","03"],["seller-2","seller","04"]]) {
   await repo.saveMessage(Message.createText({id:id??"",conversationId:"conversation",senderId:sender??"",text:"private Message must never leave source",createdAt:new Date(`2026-10-01T${time}:00:00Z`)}));
  }
  expect(measurement.facts.map(item=>item.event.eventName)).toEqual(["conversation_created","first_buyer_message_accepted","seller_first_reply"]);
  expect(measurement.facts[2]?.event).toMatchObject({payload:{firstBuyerMessageId:"buyer-1",replyMessageId:"seller-1",elapsedMs:7200000}});
  expect(JSON.stringify(measurement.facts)).not.toContain("private Message");
 });
 it("keeps chat usable during measurement failure",async()=>{
  const measurement=new FakeMeasurementCommit();measurement.unavailable=true;
  const repo=new PrismaConversationRepository(database() as never,undefined,measurement);
  await expect(repo.save(conversation())).resolves.toBeUndefined();
 });
 it("keeps a scheduled User's chat outcome but emits no new conversion facts",async()=>{
  const db=database({deletionScheduledAt:new Date("2026-10-01T00:00:00Z")}),measurement=new FakeMeasurementCommit();
  const repo=new PrismaConversationRepository(db as never,undefined,measurement);
  await repo.save(conversation());
  await repo.saveMessage(Message.createText({id:"scheduled-message",conversationId:"conversation",senderId:"buyer",text:"retained core outcome",createdAt:new Date("2026-10-01T01:00:00Z")}));
  expect(db.messages).toMatchObject([{id:"scheduled-message",body:"retained core outcome"}]);
  expect(measurement.facts).toEqual([]);
 });
 it("does not emit an accepted Message fact when the Message cannot commit",async()=>{
  const db=database({failMessage:true}),measurement=new FakeMeasurementCommit();
  const repo=new PrismaConversationRepository(db as never,undefined,measurement);
  await repo.save(conversation());
  await expect(repo.saveMessage(Message.createText({id:"failed",conversationId:"conversation",senderId:"buyer",text:"unsaved",createdAt:new Date("2026-10-01T01:00:00Z")}))).rejects.toThrow("message_failed");
  expect(db.messages).toEqual([]);expect(measurement.facts.map(fact=>fact.event.eventName)).toEqual(["conversation_created"]);
 });

});
