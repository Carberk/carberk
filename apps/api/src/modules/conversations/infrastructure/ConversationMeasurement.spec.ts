import { describe,expect,it } from "vitest";

import { FakeMeasurementCommit } from "../../measurement/application/testing/FakeMeasurementCommit";
import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";

import { PrismaConversationRepository } from "./PrismaConversationRepository";

// External database boundary only. Real repository, domain and emission port are exercised.
function database() {
 let conversation:Record<string,unknown>|null=null;
 const messages:Record<string,unknown>[]=[];
 const tx={
  $queryRaw:async()=>[],
  $executeRaw:async()=>0,
  conversation:{create:async({data}:{data:Record<string,unknown>})=>{conversation={...data};return conversation;},
   findUnique:async()=>conversation,findUniqueOrThrow:async()=>conversation,update:async({data}:{data:Record<string,unknown>})=>{conversation={...conversation,...data};return conversation;}},
  conversationParticipant:{create:async()=>({})},
  message:{create:async({data}:{data:Record<string,unknown>})=>{messages.push({...data});return data;},
   findUnique:async({where}:{where:{id:string}})=>messages.find(row=>row["id"]===where.id)??null,
   findFirst:async({where}:{where:{id?:{not:string};senderId?:string|{not:string};conversationId:string;createdAt?:{gte:Date}}})=>messages.filter(row=>row["conversationId"]===where.conversationId
    && (!where.id?.not||row["id"]!==where.id.not)
    && (typeof where.senderId==="string"?row["senderId"]===where.senderId:where.senderId?row["senderId"]!==where.senderId.not:true)
    && (!where.createdAt?.gte || (row["createdAt"] as Date)>=where.createdAt.gte)).sort((a,b)=>(a["createdAt"] as Date).getTime()-(b["createdAt"] as Date).getTime())[0]??null},
 };
 return {...tx,$transaction:async(operation:((value:typeof tx)=>Promise<unknown>)|Promise<unknown>[])=>typeof operation==="function"?operation(tx):Promise.all(operation)};
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
});
