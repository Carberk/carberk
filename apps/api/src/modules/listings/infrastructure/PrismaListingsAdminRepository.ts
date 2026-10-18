import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService,type Prisma } from "@auto-tm/db";

import { MEASUREMENT_COMMIT_PORT,type MeasurementCommitPort } from "../../measurement/measurement.public";
import type { ListingsAdminPort } from "../domain/ports/ListingsAdminPort";

@Injectable()
export class PrismaListingsAdminRepository implements ListingsAdminPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(MEASUREMENT_COMMIT_PORT) private readonly measurement?:MeasurementCommitPort) {}

  banActiveListing(listingId: string, tx?: unknown): Promise<{ status: string }> {
    return this.transition(listingId,"active","banned",tx);
  }

  unbanBannedListing(listingId: string, tx?: unknown): Promise<{ status: string }> {
    return this.transition(listingId,"banned","active",tx);
  }

  private async transition(listingId:string,from:"active"|"banned",to:"active"|"banned",transaction?:unknown):Promise<{status:string}> {
    const change=async(tx:Prisma.TransactionClient)=>{
      const initial=await tx.listing.findUnique({where:{id:listingId},select:{businessId:true}});
      // Business state controls public inventory. Preserve business -> Listing lock order.
      if(initial?.businessId)await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id"=${initial.businessId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id"=${listingId} FOR UPDATE`;
      const row=await tx.listing.update({where:{id:listingId,status:from},data:{status:to},include:{business:{select:{status:true}}}});
      if(!row.deletedAt && (!row.businessId||row.business?.status==="active")){
        try{await this.measurement?.capture(tx,row.sellerId,{version:1,eventId:randomUUID(),occurredAt:new Date().toISOString(),purpose:"product_improvement",eventName:"listing_visibility_changed",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{listingId,visibility:to==="active"?"public":"hidden",reason:to==="active"?"restored":"moderated"}});}catch{/* Core moderation survives collection outage. */}
      }
      return {status:row.status};
    };
    return transaction?change(transaction as Prisma.TransactionClient):this.prisma.$transaction(change);
  }
}
