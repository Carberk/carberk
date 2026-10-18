import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { PublicMarketplaceSchemas } from "@auto-tm/contracts";

import type { PublicMarketplaceReadPort } from "../domain/ports/PublicMarketplaceReadPort";
import { MEDIA_STORAGE_PORT, type MediaStoragePort } from "../domain/ports/MediaStoragePort";

const identity = { id: true, slug: true, name: true, logoUrl: true, city: { select: { nameTk: true, nameRu: true, nameEn: true } }, admissionMode: true, contactPhone: true, address: true, description: true, hours: true, services: true } as const;
const projection = { id: true, status: true, brand: { select: { nameTk: true, nameRu: true, nameEn: true } }, model: { select: { nameTk: true, nameRu: true, nameEn: true } }, year: true, priceAmount: true, priceCurrency: true, mileageKm: true, description: true, city: { select: { nameTk: true, nameRu: true, nameEn: true } }, media: { where: { kind: "image" as const }, orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], take: 20, select: { key: true } }, business: { select: identity }, allowChat: true, allowCalls: true, contactPhone: true } satisfies Prisma.ListingSelect;
type Row = Prisma.ListingGetPayload<{ select: typeof projection }>;
const names = (value: { nameTk: string; nameRu: string; nameEn: string }) => ({ tk: value.nameTk, ru: value.nameRu, en: value.nameEn });
const business = (row: Prisma.DealershipGetPayload<{ select: typeof identity }>): PublicMarketplaceSchemas.PublicBusiness => ({ id: row.id, slug: row.slug, name: row.name, logoUrl: row.logoUrl, city: row.city ? names(row.city) : null, identityChecked: row.admissionMode === "checked", contactPhone: row.contactPhone, address: row.address, description: row.description, hours: row.hours, services: row.services });

@Injectable()
export class PrismaPublicMarketplaceReadRepository implements PublicMarketplaceReadPort {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort) {}
 async listing(id: string) {
  const row = await this.prisma.listing.findFirst({ where: { id, deletedAt: null, status: { in: ["active", "sold"] }, OR: [{ businessId: null }, { business: { status: "active" } }] }, select: projection });
  return row ? this.map(row) : null;
 }
 async showroom(id: string, cursor?: string) {
  return this.prisma.$transaction(async tx => {
   const row = await tx.dealership.findFirst({ where: { id, status: "active" }, select: identity });
   if (!row) return null;
   const rows = await tx.listing.findMany({ where: { businessId: id, deletedAt: null, status: "active", ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: "desc" }, take: 21, select: projection });
   const page = rows.slice(0, 20);
   return { business: business(row), listings: page.map(item => this.map(item)), nextCursor: rows.length > 20 ? page.at(-1)?.id ?? null : null };
  }, { isolationLevel: "RepeatableRead" });
 }
 private map(row: Row): PublicMarketplaceSchemas.PublicListing {
  const active = row.status === "active";
  return { id: row.id, status: active ? "active" : "sold", brand: names(row.brand), model: names(row.model), year: row.year, priceAmount: row.priceAmount, priceCurrency: row.priceCurrency, mileageKm: row.mileageKm, description: row.description, city: names(row.city), photos: row.media.map(media => this.storage.resolvePublicUrl(media.key)), business: row.business ? business(row.business) : null, allowChat: active && row.allowChat, contactPhone: active && row.allowCalls ? row.business?.contactPhone ?? row.contactPhone : null };
 }
}
