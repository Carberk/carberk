import { expect,it } from "vitest";

import { FakeMeasurementCommit } from "../../measurement/application/testing/FakeMeasurementCommit";

import { PrismaListingRepository } from "./PrismaListingRepository";
function persistence(archiveBeforeLock=false){
 let row={id:"listing",sellerId:"seller",businessId:null,status:"active",deletedAt:null as Date|null};const calls:string[]=[];
 const tx={$queryRaw:async()=>{calls.push("lock");if(archiveBeforeLock)row={...row,status:"archived"};return[];},listing:{findUnique:async()=>{calls.push("read");return {...row};},update:async({data}:{data:{deletedAt:Date}})=>{calls.push("delete");row={...row,...data};return {...row};}}};
 return {calls,db:{$transaction:async(operation:(transaction:typeof tx)=>Promise<void>)=>operation(tx)}};
}
it("uses the current locked visibility when a concurrent archive wins before deletion",async()=>{
 const {db}=persistence(true),measurement=new FakeMeasurementCommit();
 await new PrismaListingRepository(db as never,undefined,undefined,undefined,measurement).softDelete("listing",new Date("2026-10-18T00:00:00Z"));
 expect(measurement.facts).toEqual([]);
});
it("emits a hidden transition once for actual public deletion and never repeats it",async()=>{
 const {db}=persistence(),measurement=new FakeMeasurementCommit(),repo=new PrismaListingRepository(db as never,undefined,undefined,undefined,measurement),at=new Date("2026-10-18T00:00:00Z");
 await repo.softDelete("listing",at);await repo.softDelete("listing",at);
 expect(measurement.facts).toHaveLength(1);expect(measurement.facts[0]).toMatchObject({userId:"seller",event:{occurredAt:at.toISOString(),eventName:"listing_visibility_changed",payload:{listingId:"listing",visibility:"hidden",reason:"deleted"}}});
});
