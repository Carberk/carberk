import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { PrismaService } from "@auto-tm/db";

import { PrismaMeasurementCommit } from "../../measurement/infrastructure/PrismaMeasurementCommit";
import { cleanSuiteFixtures,defineE2eSuite,seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { PrismaListingsAdminRepository } from "./PrismaListingsAdminRepository";

const suite=defineE2eSuite("moderation-measurement-917"),epoch=suite.id("epoch"),seller=suite.id("seller"),listing=suite.id("listing"),principal=suite.id("principal");
describe("Listing moderation source commits",()=>{
 let db:PrismaService,repo:PrismaListingsAdminRepository;
 async function cleanup(){if(!db)return;await db.measurementPrincipal.deleteMany({where:{epoch}});await db.measurementState.deleteMany({where:{key:"collector",epoch}});await cleanSuiteFixtures(db,suite,{userAliases:["seller"]});}
 beforeAll(async()=>{db=new PrismaService();await db.$connect();repo=new PrismaListingsAdminRepository(db,new PrismaMeasurementCommit({enabled:true,environment:"test",purposes:["product_improvement"],evidenceRef:"synthetic-moderation-917",realCollectionApproved:false},epoch));});
 beforeEach(async()=>{await cleanup();const catalog=await seedSuiteCatalog(db,suite);await db.user.create({data:{id:seller,phone:suite.phone("seller"),phoneVerifiedAt:new Date()}});await db.listing.create({data:{id:listing,sellerId:seller,brandId:catalog.brandId,modelId:catalog.modelId,cityId:catalog.cityId,status:"active",priceAmount:1000,priceCurrency:"TMT"}});await db.measurementState.create({data:{key:"collector",epoch}});await db.measurementPrincipal.create({data:{id:principal,userId:seller,pseudonym:randomUUID().replaceAll("-","").repeat(2),generation:suite.id("generation"),epoch,kind:"account"}});});
 afterAll(async()=>{await cleanup();await db.$disconnect();});
 async function events(){return (await db.measurementOutbox.findMany({where:{principalId:principal},orderBy:{createdAt:"asc"}})).map(row=>row.event);}
 it("persists exactly the hidden/public facts alongside a ban and unban",async()=>{
  await repo.banActiveListing(listing);await repo.unbanBannedListing(listing);
  expect(await events()).toEqual(expect.arrayContaining([expect.objectContaining({eventName:"listing_visibility_changed",payload:{listingId:listing,visibility:"hidden",reason:"moderated"}}),expect.objectContaining({eventName:"listing_visibility_changed",payload:{listingId:listing,visibility:"public",reason:"restored"}})]));expect(await events()).toHaveLength(2);
 });
 it("rolls back the source and outbox together when its owning transaction fails",async()=>{
  await expect(db.$transaction(async tx=>{await repo.banActiveListing(listing,tx);throw new Error("synthetic owner failure");})).rejects.toThrow("synthetic owner failure");
  expect((await db.listing.findUniqueOrThrow({where:{id:listing}})).status).toBe("active");expect(await events()).toEqual([]);
 });
 it("does not advertise a deleted Listing as public when its ban is lifted",async()=>{
  await db.listing.update({where:{id:listing},data:{status:"banned",deletedAt:new Date()}});await repo.unbanBannedListing(listing);expect(await events()).toEqual([]);
 });
 it("keeps moderation available with collection disabled",async()=>{
  const closed=new PrismaListingsAdminRepository(db,new PrismaMeasurementCommit({enabled:false,environment:"test",purposes:["product_improvement"],evidenceRef:"synthetic-closed",realCollectionApproved:false},epoch));await closed.banActiveListing(listing);expect((await db.listing.findUniqueOrThrow({where:{id:listing}})).status).toBe("banned");expect(await events()).toEqual([]);
 });
});
