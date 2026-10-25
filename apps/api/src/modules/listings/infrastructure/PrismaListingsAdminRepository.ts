import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService,type Prisma, withDiagnosticSourceCommand, assertDiagnosticSourceCommand, listingSourceCommand, type PreparedDiagnosticSource } from "@auto-tm/db";

import { MEASUREMENT_COMMIT_PORT,type MeasurementCommitPort } from "../../measurement/measurement.public";
import type { ListingsAdminPort } from "../domain/ports/ListingsAdminPort";

@Injectable()
export class PrismaListingsAdminRepository implements ListingsAdminPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(MEASUREMENT_COMMIT_PORT) private readonly measurement?:MeasurementCommitPort) {}

  banActiveListing(listingId: string, tx?: unknown, receipt?: unknown): Promise<{ status: string }> {
    return this.transition(listingId,"active","banned",tx,receipt);
  }

  unbanBannedListing(listingId: string, tx?: unknown, receipt?: unknown): Promise<{ status: string }> {
    return this.transition(listingId,"banned","active",tx,receipt);
  }

  private async transition(listingId:string,from:"active"|"banned",to:"active"|"banned",transaction?:unknown,suppliedReceipt?:unknown):Promise<{status:string}> {
    const change=async(tx:Prisma.TransactionClient)=>{
      const source=await tx.listing.findUnique({where:{id:listingId},select:{sellerId:true,businessId:true}});
      if (!source) throw new Error("LISTING_NOT_FOUND");
      const run=async(receipt:PreparedDiagnosticSource)=>{
      if (!receipt || typeof receipt.receiptId !== "string") throw new Error("diagnostic_source_receipt_required");
      await assertDiagnosticSourceCommand(tx,receipt,"listing_change");
      const users = await tx.$queryRaw<{ deletionScheduledAt: Date | null }[]>`SELECT "deletionScheduledAt" FROM "users" WHERE "id"=${source.sellerId} FOR UPDATE`;
      const eligible = !!users[0] && !users[0].deletionScheduledAt;
      // Business state controls public inventory. Preserve business -> Listing lock order.
      if(source.businessId)await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id"=${source.businessId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id"=${listingId} FOR UPDATE`;
      const row=await tx.listing.update({where:{id:listingId,status:from},data:{status:to},include:{business:{select:{status:true}}}});
      if(eligible && !row.deletedAt && (!row.businessId||row.business?.status==="active")){
        try{await this.measurement?.capture(tx,row.sellerId,{version:1,eventId:randomUUID(),occurredAt:new Date().toISOString(),purpose:"product_improvement",eventName:"listing_visibility_changed",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{listingId,visibility:to==="active"?"public":"hidden",reason:to==="active"?"restored":"moderated"}});}catch{/* Core moderation survives collection outage. */}
      }
      return {status:row.status};
      };
      if (transaction) return run(suppliedReceipt as PreparedDiagnosticSource);
      const command = await listingSourceCommand(tx, { operation: "listing_change", listingId, actorUserId: source.sellerId,
        roots: [{table:"users",key:{id:source.sellerId}}], changes: { status: to } });
      return withDiagnosticSourceCommand(tx, command, run);
    };
    return transaction?change(transaction as Prisma.TransactionClient):this.prisma.$transaction(change);
  }
}
