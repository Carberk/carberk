import { randomUUID } from "node:crypto";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { MEASUREMENT_COMMIT_PORT,type MeasurementCommitPort } from "../../measurement/measurement.public";
import { ContactPhonePolicy } from "../domain/ContactPhonePolicy";
import { contactPhoneRejection } from "../application/contactPhoneRejection";
import { IDENTITY_CLOCK_PORT, type ClockPort } from "../../identity/identity.public";
import { lockEditableBusinessStock } from "./lockEditableBusinessStock";
import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService, recomputeListingPricesTmt, withDiagnosticSourceCommand, assertDiagnosticSourceCommand, type DiagnosticSourceTuple } from "@auto-tm/db";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";

function n<T>(v: T | undefined): T | null {
  return v ?? null;
}

const listingSource = (row: { id: string; sellerId: string; businessId: string | null; vin: string | null; brandId: string; modelId: string; year: number | null; deletedAt: Date | null; status: string }): DiagnosticSourceTuple => ({
  id: row.id, sellerId: row.sellerId, businessId: row.businessId, vin: row.vin, brandId: row.brandId,
  modelId: row.modelId, year: row.year, deletedAt: row.deletedAt?.toISOString() ?? null, status: row.status,
});

@Injectable()
export class PrismaListingRepository implements ListingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
    @Optional() @Inject(ContactPhonePolicy) private readonly contactPhones?: ContactPhonePolicy,
    @Optional() @Inject(IDENTITY_CLOCK_PORT) private readonly clock?: ClockPort,
    @Optional() @Inject(MEASUREMENT_COMMIT_PORT) private readonly measurement?:MeasurementCommitPort) {}

  async save(listing: Listing): Promise<Listing> {
    const row = await this.prisma.$transaction(async (tx) => withDiagnosticSourceCommand(tx, {
      operation: "listing_create", roots: [{ table: "listings", key: { id: listing.id } }],
      rows: [{ table: "listings", key: { id: listing.id }, verb: "insert", expected: "absent", next: listingSource({ id: listing.id, sellerId: listing.sellerId, businessId: listing.businessId ?? null, vin: listing.vin ?? null, brandId: listing.brandId, modelId: listing.modelId, year: listing.year ?? null, deletedAt: listing.deletedAt ?? null, status: listing.status }) }],
      actorUserId: listing.sellerId, sessionId: null, cutoff: null, campaign: null,
    }, async (receipt) => {
      await assertDiagnosticSourceCommand(tx, receipt, "listing_create");
      return tx.listing.create({
      data: {
        id: listing.id,
        sellerId: listing.sellerId,
        businessId: listing.businessId ?? null,
        status: listing.status,
        brandId: listing.brandId,
        modelId: listing.modelId,
        generationId: n(listing.generationId),
        year: n(listing.year),
        vin: n(listing.vin),
        cityId: listing.cityId,
        regionId: n(listing.regionId),
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency,
        contactPhone: n(listing.contactPhone),
        allowCalls: listing.allowCalls,
        allowChat: listing.allowChat,
        publishedAt: n(listing.publishedAt),
        soldAt: n(listing.soldAt),
        deletedAt: n(listing.deletedAt),
        condition: n(listing.condition),
        colorId: n(listing.colorId),
        bodyTypeId: n(listing.bodyTypeId),
        engineTypeId: n(listing.engineTypeId),
        transmissionId: n(listing.transmissionId),
        driveTypeId: n(listing.driveTypeId),
        enginePower: n(listing.enginePower),
        mileageKm: n(listing.mileageKm),
        locationText: n(listing.locationText),
        description: n(listing.description),
        acceptsExchange: listing.acceptsExchange,
        installmentAvailable: listing.installmentAvailable,
        viewCount: listing.viewCount,
        favoriteCount: listing.favoriteCount,
        damaged: n(listing.conditionDisclosure?.damaged),
        knownIssuesText: n(listing.conditionDisclosure?.knownIssuesText),
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      },
      });
    }));
    return this.toDomain(row);
  }

  async findById(id: string): Promise<Listing | null> {
    const row = await this.prisma.listing.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySellerId(
    sellerId: string,
    opts?: { cursor?: { timestamp: string; id: string }; limit?: number },
  ): Promise<{ items: Listing[]; nextCursor?: { timestamp: string; id: string } }> {
    const take = (opts?.limit ?? 20) + 1;

    const rows = await this.prisma.listing.findMany({
      where: { sellerId, businessId: null, deletedAt: null },
      take,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(opts?.cursor
        ? {
            skip: 1,
            cursor: { id: opts.cursor.id },
          }
        : {}),
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    const result: { items: Listing[]; nextCursor?: { timestamp: string; id: string } } = {
      items: items.map((r) => this.toDomain(r)),
    };
    if (hasMore && last) {
      result.nextCursor = { timestamp: last.updatedAt.toISOString(), id: last.id };
    }
    return result;
  }

  async update(listing: Listing, derived?: { priceTmt: number }, actor?: ListingActor): Promise<Listing> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.listing.findUniqueOrThrow({ where: { id: listing.id }, select: { id:true,sellerId:true,businessId:true,vin:true,brandId:true,modelId:true,year:true,deletedAt:true,status:true } });
      return withDiagnosticSourceCommand(tx, { operation: "listing_change", roots: [{ table: "listings", key: { id: listing.id } }], rows: [{ table: "listings", key: { id: listing.id }, verb: "update", expected: { source: listingSource(before) }, next: listingSource({ id: listing.id, sellerId: listing.sellerId, businessId: listing.businessId ?? null, vin: listing.vin ?? null, brandId: listing.brandId, modelId: listing.modelId, year: listing.year ?? null, deletedAt: listing.deletedAt ?? null, status: listing.status }) }], actorUserId: actor?.userId ?? listing.sellerId, sessionId: null, cutoff: null, campaign: null }, async (receipt) => {
      await assertDiagnosticSourceCommand(tx, receipt, "listing_change");
      if (listing.businessId) {
        if (!actor) throw new Error("Business Listing requires current actor");
        await assertListingOwnership(this.ownership, actor, listing, tx);
        await lockEditableBusinessStock(tx, listing.id);
        const stored = await tx.listing.findUniqueOrThrow({ where: { id: listing.id } });
        if (stored.contactPhone !== (listing.contactPhone ?? null) || (listing.status === "active" && stored.status !== "active")) {
          if (!this.contactPhones || !this.clock) throw new Error("Business contact policy is unavailable");
          const rejection = contactPhoneRejection(await this.contactPhones.standing(listing.sellerId, listing.contactPhone, this.clock.now(), listing.businessId, tx));
          if (rejection) throw rejection;
        }
      }
      if(this.measurement) await tx.$queryRaw`SELECT id FROM listings WHERE id=${listing.id} FOR UPDATE`;
      const previous=this.measurement?await tx.listing.findUnique({where:{id:listing.id},select:{status:true,deletedAt:true}}):null;
      const saved=await tx.listing.update({
      where: { id: listing.id },
      data: {
        ...(actor && listing.businessId ? { lastEditedById: actor.userId } : {}),
        ...(derived !== undefined ? { priceTmt: derived.priceTmt } : {}),
        status: listing.status,
        brandId: listing.brandId,
        modelId: listing.modelId,
        generationId: n(listing.generationId),
        year: n(listing.year),
        vin: n(listing.vin),
        cityId: listing.cityId,
        regionId: n(listing.regionId),
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency,
        contactPhone: n(listing.contactPhone),
        allowCalls: listing.allowCalls,
        allowChat: listing.allowChat,
        publishedAt: n(listing.publishedAt),
        soldAt: n(listing.soldAt),
        deletedAt: n(listing.deletedAt),
        condition: n(listing.condition),
        colorId: n(listing.colorId),
        bodyTypeId: n(listing.bodyTypeId),
        engineTypeId: n(listing.engineTypeId),
        transmissionId: n(listing.transmissionId),
        driveTypeId: n(listing.driveTypeId),
        enginePower: n(listing.enginePower),
        mileageKm: n(listing.mileageKm),
        locationText: n(listing.locationText),
        description: n(listing.description),
        acceptsExchange: listing.acceptsExchange,
        installmentAvailable: listing.installmentAvailable,
        damaged: n(listing.conditionDisclosure?.damaged),
        knownIssuesText: n(listing.conditionDisclosure?.knownIssuesText),
      },
    });
      const wasPublic=previous?.status==="active" && !previous.deletedAt;
      const isPublic=saved.status==="active" && !saved.deletedAt;
      if(previous && wasPublic!==isPublic) await this.visibility(tx,saved.sellerId,saved.id,isPublic,saved.deletedAt?"deleted":saved.status==="sold"?"sold":saved.status==="archived"?"archived":saved.status==="banned"?"moderated":"restored");
      return saved;
    }); });
    return this.toDomain(row);
  }

  async recomputePriceTmt(): Promise<number> {
    return recomputeListingPricesTmt(this.prisma);
  }

  async softDelete(id: string, at: Date, actor?: ListingActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.listing.findUnique({ where: { id } });
      if (!row) { await tx.listing.update({ where: { id }, data: { deletedAt: at } }); return; }
      // Small in-memory adapters used by the application boundary tests do not
      // expose the generated Prisma transaction surface. Keep their stateful
      // behavior while production transactions always take the prepared path.
      if (!("session" in (tx as object))) {
        if (row.businessId) {
          if (!actor) throw new Error("Business Listing requires current actor");
          await assertListingOwnership(this.ownership, actor, { sellerId: row.sellerId, businessId: row.businessId }, tx);
        }
        if(this.measurement) await tx.$queryRaw`SELECT id FROM listings WHERE id=${id} FOR UPDATE`;
        const current= this.measurement ? await tx.listing.findUnique({where:{id}}) : row;
        await tx.listing.update({ where: { id }, data: { deletedAt: at } });
        if(current && !current.deletedAt && current.status === "active") await this.visibility(tx,current.sellerId,id,false,"deleted",at);
        return;
      }
      await withDiagnosticSourceCommand(tx, { operation: "listing_delete", roots: [{ table: "listings", key: { id } }], rows: [{ table: "listings", key: { id }, verb: "update", expected: { source: listingSource(row) }, next: listingSource({ ...row, deletedAt: at }) }], actorUserId: actor?.userId ?? row.sellerId, sessionId: null, cutoff: null, campaign: null }, async (receipt) => {
      await assertDiagnosticSourceCommand(tx, receipt, "listing_delete");
      if (row?.businessId) {
        if (!actor) throw new Error("Business Listing requires current actor");
        await assertListingOwnership(this.ownership, actor, { sellerId: row.sellerId, businessId: row.businessId }, tx);
      }
      // Business authority locks precede Listing locks. Refetch after the lock so a concurrent status change cannot emit a stale transition.
      if(this.measurement)await tx.$queryRaw`SELECT id FROM listings WHERE id=${id} FOR UPDATE`;
      const current=this.measurement?await tx.listing.findUnique({where:{id}}):row;
      await tx.listing.update({ where: { id }, data: { deletedAt: at } });
      if(current && !current.deletedAt && current.status==="active") await this.visibility(tx,current.sellerId,id,false,"deleted",at);
      });
    });
  }

  private async visibility(tx:object,userId:string,listingId:string,visible:boolean,reason:Extract<MeasurementSchemas.MeasurementEvent,{eventName:"listing_visibility_changed"}>["payload"]["reason"],at=this.clock?.now()??new Date()) {
    try {await this.measurement?.capture(tx,userId,{version:1,eventId:randomUUID(),occurredAt:at.toISOString(),purpose:"product_improvement",eventName:"listing_visibility_changed",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{listingId,visibility:visible?"public":"hidden",reason}});} catch { /* Core outcome survives collector outage. */ }
  }

  private toDomain(row: {
    id: string;
    publicNumber: number;
    sellerId: string;
    businessId?: string | null;
    status: string;
    brandId: string;
    modelId: string;
    generationId: string | null;
    year: number | null;
    vin: string | null;
    cityId: string;
    regionId: string | null;
    priceAmount: number;
    priceCurrency: string;
    contactPhone: string | null;
    allowCalls: boolean;
    allowChat: boolean;
    publishedAt: Date | null;
    soldAt: Date | null;
    deletedAt: Date | null;
    condition: string | null;
    colorId: string | null;
    bodyTypeId: string | null;
    engineTypeId: string | null;
    transmissionId: string | null;
    driveTypeId: string | null;
    enginePower: number | null;
    mileageKm: number | null;
    locationText: string | null;
    description: string | null;
    viewCount: number;
    favoriteCount: number;
    acceptsExchange: boolean;
    installmentAvailable: boolean;
    damaged: boolean | null;
    knownIssuesText: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Listing {
    return Listing.create({
      id: row.id,
      publicNumber: row.publicNumber,
      sellerId: row.sellerId,
      ...(row.businessId ? { businessId: row.businessId } : {}),
      status: row.status as "active" | "sold" | "archived" | "banned",
      brandId: row.brandId,
      modelId: row.modelId,
      cityId: row.cityId,
      priceAmount: row.priceAmount,
      priceCurrency: row.priceCurrency as "TMT" | "USD" | "AED",
      allowCalls: row.allowCalls,
      allowChat: row.allowChat,
      publishedAt: row.publishedAt ?? new Date(),
      viewCount: row.viewCount,
      favoriteCount: row.favoriteCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.generationId ? { generationId: row.generationId } : {}),
      ...(row.year ? { year: row.year } : {}),
      ...(row.vin ? { vin: row.vin } : {}),
      ...(row.regionId ? { regionId: row.regionId } : {}),
      ...(row.contactPhone ? { contactPhone: row.contactPhone } : {}),
      ...(row.soldAt ? { soldAt: row.soldAt } : {}),
      ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
      ...(row.condition ? { condition: row.condition as "new" | "used" } : {}),
      ...(row.colorId ? { colorId: row.colorId } : {}),
      ...(row.bodyTypeId ? { bodyTypeId: row.bodyTypeId } : {}),
      ...(row.engineTypeId ? { engineTypeId: row.engineTypeId } : {}),
      ...(row.transmissionId ? { transmissionId: row.transmissionId } : {}),
      ...(row.driveTypeId ? { driveTypeId: row.driveTypeId } : {}),
      ...(row.enginePower ? { enginePower: row.enginePower } : {}),
      ...(row.mileageKm ? { mileageKm: row.mileageKm } : {}),
      ...(row.locationText ? { locationText: row.locationText } : {}),
      ...(row.description ? { description: row.description } : {}),
      acceptsExchange: row.acceptsExchange,
      installmentAvailable: row.installmentAvailable,
      // A Listing without a Damaged answer has no disclosure to show.
      ...(row.damaged !== null
        ? {
            conditionDisclosure: {
              damaged: row.damaged,
              ...(row.knownIssuesText !== null ? { knownIssuesText: row.knownIssuesText } : {}),
            },
          }
        : {}),
    });
  }
}
