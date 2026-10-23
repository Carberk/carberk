import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@auto-tm/db";
import { PrismaService } from "@auto-tm/db";
import { AdminContextSchemas, UploadsSchemas } from "@auto-tm/contracts";

import { MEDIA_STORAGE_PORT, type MediaStoragePort } from "../../listings/domain/ports/MediaStoragePort";
import type { AdminContextReadPort } from "../domain/ports/AdminContextReadPort";

const nameSelect = { nameRu: true, nameTk: true, nameEn: true } as const;
const userSelect = { id: true, displayName: true, nameNumber: true, createdAt: true, suspendedAt: true, deletionScheduledAt: true } as const;
const listingSelect = {
  id: true, publicNumber: true, sellerId: true, status: true, year: true,
  priceAmount: true, priceCurrency: true, createdAt: true, deletedAt: true,
  brand: { select: nameSelect }, model: { select: nameSelect }, city: { select: nameSelect }, region: { select: nameSelect },
} as const;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type ListingRow = Prisma.ListingGetPayload<{ select: typeof listingSelect }>;
type StoredNames = { nameRu: string; nameTk: string; nameEn: string };
type LocalizedNames = { ru: string; tk: string; en: string };
function names(row: StoredNames): LocalizedNames;
function names(row: StoredNames | null): LocalizedNames | null;
function names(row: StoredNames | null): LocalizedNames | null {
  return row ? { ru: row.nameRu, tk: row.nameTk, en: row.nameEn } : null;
}
const userSummary = (row: UserRow) => ({ id: row.id, displayName: row.displayName, nameNumber: row.nameNumber, createdAt: row.createdAt.toISOString(), suspended: row.suspendedAt !== null, deletionScheduled: row.deletionScheduledAt !== null });
const listingSummary = (row: ListingRow) => ({ id: row.id, publicNumber: row.publicNumber, sellerId: row.sellerId, status: row.status, year: row.year, priceAmount: row.priceAmount, priceCurrency: row.priceCurrency, createdAt: row.createdAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null, brand: names(row.brand), model: names(row.model), city: names(row.city), region: names(row.region) });

/** Explicit database selects enforce the moderation projection before transport.
 * Never resolve video storage keys through the public photo URL mechanism. */
@Injectable()
export class PrismaAdminContextReader implements AdminContextReadPort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort) {}

  async listings(query: AdminContextSchemas.AdminContextListingQuery): Promise<AdminContextSchemas.AdminContextListingPage> {
    const where: Prisma.ListingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.regionId ? { regionId: query.regionId } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      ...(query.q ? { OR: [
        { id: query.q }, { vin: { contains: query.q, mode: "insensitive" } },
        { brand: { OR: ["nameRu", "nameTk", "nameEn"].map(field => ({ [field]: { contains: query.q, mode: "insensitive" } })) } },
        { model: { OR: ["nameRu", "nameTk", "nameEn"].map(field => ({ [field]: { contains: query.q, mode: "insensitive" } })) } },
        ...(/^\d+$/.test(query.q) && Number(query.q) <= 2147483647 ? [{ publicNumber: Number(query.q) }] : []),
      ] } : {}),
    };
    const [rows, total, brands, regions] = await Promise.all([this.db.listing.findMany({ where, select: listingSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.db.listing.count({ where }), this.db.brand.findMany({ select: { id: true, ...nameSelect }, orderBy: { nameRu: "asc" }, take: 500 }), this.db.region.findMany({ select: { id: true, ...nameSelect }, orderBy: { nameRu: "asc" }, take: 100 })]);
    return { items: rows.map(listingSummary), total, page: query.page, pageSize: query.pageSize, brands: brands.map(row => ({ id: row.id, name: names(row) })), regions: regions.map(row => ({ id: row.id, name: names(row) })) };
  }

  async listing(id: string): Promise<AdminContextSchemas.AdminContextListingDetail | null> {
    const row = await this.db.listing.findUnique({ where: { id }, select: {
      ...listingSelect, description: true, vin: true, mileageKm: true, condition: true, enginePower: true,
      damaged: true, knownIssuesText: true, locationText: true, publishedAt: true, soldAt: true, updatedAt: true,
      generationId: true, colorId: true, bodyTypeId: true,
      engineTypeId: true, transmissionId: true, driveTypeId: true,
      engineType: { select: nameSelect }, transmission: { select: nameSelect }, driveType: { select: nameSelect },
      seller: { select: userSelect }, media: { select: { id: true, kind: true, key: true, width: true, height: true }, orderBy: { sortOrder: "asc" } },
    } });
    if (!row) return null;
    const [generation, color, bodyType, complaintCount] = await Promise.all([
      row.generationId ? this.db.generation.findUnique({ where: { id: row.generationId }, select: nameSelect }) : null,
      row.colorId ? this.db.color.findUnique({ where: { id: row.colorId }, select: nameSelect }) : null,
      row.bodyTypeId ? this.db.bodyType.findUnique({ where: { id: row.bodyTypeId }, select: nameSelect }) : null,
      this.db.contentReport.count({ where: { targetType: "listing", targetId: id } }),
    ]);
    return AdminContextSchemas.AdminContextListingDetailSchema.parse({
      ...listingSummary(row), description: row.description, vin: row.vin, mileageKm: row.mileageKm,
      condition: row.condition, enginePower: row.enginePower, damaged: row.damaged, knownIssuesText: row.knownIssuesText,
      locationText: row.locationText, publishedAt: row.publishedAt?.toISOString() ?? null, soldAt: row.soldAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(), seller: userSummary(row.seller), complaintCount,
      specifications: [
        { name: "generation", value: names(generation), id: row.generationId },
        { name: "color", value: names(color), id: row.colorId },
        { name: "bodyType", value: names(bodyType), id: row.bodyTypeId },
        { name: "engineType", value: names(row.engineType), id: row.engineTypeId },
        { name: "transmission", value: names(row.transmission), id: row.transmissionId },
        { name: "driveType", value: names(row.driveType), id: row.driveTypeId },
      ],
      media: row.media.map(media => ({ id: media.id, kind: media.kind === "image" ? "photo" : "video", url: media.kind === "image" ? `${this.storage.resolvePublicUrl(`${media.key.replace(/\/original\.(jpg|webp|jpeg)$/, "")}/fullscreen.webp`)}?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}` : null, width: media.width, height: media.height })),
    });
  }

  async users(query: AdminContextSchemas.AdminContextQuery): Promise<AdminContextSchemas.AdminContextUserPage> {
    const where: Prisma.UserWhereInput = query.q ? { OR: [
      { id: query.q }, { displayName: { contains: query.q, mode: "insensitive" } },
      ...(/^\d{4}$/.test(query.q) ? [{ nameNumber: Number(query.q) }] : []),
    ] } : {};
    const [rows, total] = await Promise.all([this.db.user.findMany({ where, select: userSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.db.user.count({ where })]);
    return { items: rows.map(userSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async user(id: string): Promise<AdminContextSchemas.AdminContextUserDetail | null> {
    const row = await this.db.user.findUnique({ where: { id }, select: userSelect });
    if (!row) return null;
    const [listings, listingCount, complaintCount] = await Promise.all([
      this.db.listing.findMany({ where: { sellerId: id }, select: listingSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25 }),
      this.db.listing.count({ where: { sellerId: id } }),
      this.db.contentReport.count({ where: { targetType: "user", targetId: id } }),
    ]);
    return { ...userSummary(row), listings: listings.map(listingSummary), listingCount, complaintCount };
  }
}
