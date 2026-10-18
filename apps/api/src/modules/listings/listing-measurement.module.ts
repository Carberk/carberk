import { Module } from "@nestjs/common";
import type { Prisma } from "@auto-tm/db";

import { MEASUREMENT_CONVERSION_PORT,type MeasurementConversionPort } from "../measurement/measurement.public";

/** Listing owns owner/member classification. The collector never interprets account roles. */
class ListingMeasurementConversion implements MeasurementConversionPort {
 async eligible(transaction:object,input:Parameters<MeasurementConversionPort["eligible"]>[1]):Promise<boolean> {
  const event=input.event;
  if(event.eventName!=="call_intent" && event.eventName!=="listing_detail_opened") return true;
  const tx=transaction as Prisma.TransactionClient;
  const listing=await tx.listing.findUnique({where:{id:event.payload.listingId},select:{sellerId:true,business:{select:{members:{select:{userId:true}}}}}});
  if(!listing) return false;
  return listing.sellerId!==input.userId && !listing.business?.members.some(member=>member.userId===input.userId);
 }
}
@Module({providers:[{provide:MEASUREMENT_CONVERSION_PORT,useClass:ListingMeasurementConversion}],exports:[MEASUREMENT_CONVERSION_PORT]})
export class ListingMeasurementModule {}
