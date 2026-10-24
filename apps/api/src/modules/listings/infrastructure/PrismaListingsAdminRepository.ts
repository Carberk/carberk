import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService,type Prisma, withDiagnosticSourceCommand, assertDiagnosticSourceCommand, type DiagnosticSourceTuple } from "@auto-tm/db";

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
      const source=await tx.listing.findUnique({where:{id:listingId},select:{id:true,sellerId:true,businessId:true,vin:true,brandId:true,modelId:true,year:true,deletedAt:true,status:true}});
      if (!source) throw new Error("LISTING_NOT_FOUND");
      const tuple=(row:typeof source): DiagnosticSourceTuple=>({id:row.id,sellerId:row.sellerId,businessId:row.businessId,vin:row.vin,brandId:row.brandId,modelId:row.modelId,year:row.year,deletedAt:row.deletedAt?.toISOString()??null,status:row.status});
      const run=async(receipt?:Parameters<typeof assertDiagnosticSourceCommand>[1])=>{
      if (receipt) await assertDiagnosticSourceCommand(tx,receipt,"listing_change");
      // Business state controls public inventory. Preserve business -> Listing lock order.
      if(initial?.businessId)await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id"=${initial.businessId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id"=${listingId} FOR UPDATE`;
      const row=await tx.listing.update({where:{id:listingId,status:from},data:{status:to},include:{business:{select:{status:true}}}});
      if(!row.deletedAt && (!row.businessId||row.business?.status==="active")){
        try{await this.measurement?.capture(tx,row.sellerId,{version:1,eventId:randomUUID(),occurredAt:new Date().toISOString(),purpose:"product_improvement",eventName:"listing_visibility_changed",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{listingId,visibility:to==="active"?"public":"hidden",reason:to==="active"?"restored":"moderated"}});}catch{/* Core moderation survives collection outage. */}
      }
      return {status:row.status};
      };
      if (transaction) return run();
      return withDiagnosticSourceCommand(tx,{operation:"listing_change",roots:[{table:"listings",key:{id:listingId}}],rows:[{table:"listings",key:{id:listingId},verb:"update",expected:{source:tuple(source)},next:tuple({...source,status:to})}],actorUserId:source.sellerId,sessionId:null,cutoff:null,campaign:null},run);
    };
    return transaction?change(transaction as Prisma.TransactionClient):this.prisma.$transaction(change);
  }
}
