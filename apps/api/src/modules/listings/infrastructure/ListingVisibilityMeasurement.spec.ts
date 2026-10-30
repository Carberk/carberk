import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { expect,it } from "vitest";

import { FakeMeasurementCommit } from "../../measurement/application/testing/FakeMeasurementCommit";

import { PrismaListingRepository } from "./PrismaListingRepository";
function persistence(archiveBeforeLock=false){
 const memory = new PreparedTransactionDatabase();
 memory.seed("user", { id: "seller", deletionScheduledAt: null });
 memory.seed("listing", {id:"listing",sellerId:"seller",businessId:null,status:"active",deletedAt:null});
 if (archiveBeforeLock) memory.beforePrepared = () => { memory.rows("listing")[0]!["status"] = "archived"; };
 return { db: memory.client };
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
