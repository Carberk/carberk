import { Prisma, type PrismaClient } from "../generated/prisma/client/client";
import { reviewerScenarioSeedIds, type ReviewerScenarioCatalog, type ReviewerScenarioSeedStore, type ReviewerScenarioUser } from "../src/reviewer-scenario-seed";

import { upsertMaintenanceListing } from "./maintenance-listings";
import { uploadReviewerPhoto } from "./reviewer-fixtures/uploadReviewerPhoto";

type PrismaOrTx = PrismaClient;

/** A nullable Json column takes SQL NULL as `Prisma.DbNull`, matching a create that omits it. */
function jsonOrDbNull(value: Record<string, unknown> | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export class PrismaReviewerScenarioSeedStore implements ReviewerScenarioSeedStore {
  constructor(private readonly prisma: PrismaOrTx) {}

  async findUserById(id: string): Promise<ReviewerScenarioUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, email: true, role: true, displayName: true, phoneVerifiedAt: true, emailVerifiedAt: true, deletionScheduledAt: true },
    });
    return user;
  }

  async findUserByPhone(phone: string): Promise<ReviewerScenarioUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, email: true, role: true, displayName: true, phoneVerifiedAt: true, emailVerifiedAt: true, deletionScheduledAt: true },
    });
    return user;
  }

  async findUserByEmail(email: string): Promise<ReviewerScenarioUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, phone: true, email: true, role: true, displayName: true, phoneVerifiedAt: true, emailVerifiedAt: true, deletionScheduledAt: true },
    });
  }

  async upsertUser(input: {
    id: string;
    phone: string;
    email: string;
    displayName: string;
    role: "buyer" | "seller";
  }): Promise<ReviewerScenarioUser> {
    // Fixed per role, not left to the column's random default, so the
    // reviewer accounts look the same after every run.
    const identity =
      input.role === "seller"
        ? { nameNumber: 2057, avatarIndex: 2 }
        : { nameNumber: 4821, avatarIndex: 7 };
    const existing = await this.findUserById(input.id);
    if (existing) {
      if (existing.phone !== input.phone || existing.email !== input.email || existing.role !== input.role ||
          !existing.phoneVerifiedAt || !existing.emailVerifiedAt || existing.deletionScheduledAt !== null) {
        throw new Error("Reviewer seed refused: unsupported existing-source rotation");
      }
      if (existing.displayName === input.displayName) return existing;
      // Scalar-only compare-and-set. Never target unchanged protected columns.
      const changed = await this.prisma.user.updateMany({ where: {
        id: existing.id, phone: existing.phone, email: existing.email, role: input.role,
        phoneVerifiedAt: existing.phoneVerifiedAt, emailVerifiedAt: existing.emailVerifiedAt,
        deletionScheduledAt: existing.deletionScheduledAt,
      }, data: { displayName: input.displayName } });
      if (changed.count !== 1) throw new Error("Reviewer seed refused: existing-source changed");
      return { ...existing, displayName: input.displayName };
    }
    return this.prisma.user.create({
      data: {
        id: input.id,
        phone: input.phone,
        phoneVerifiedAt: new Date(),
        email: input.email,
        emailVerifiedAt: new Date(),
        displayName: input.displayName,
        ...identity,
        role: input.role,
      },
      select: { id: true, phone: true, email: true, role: true, displayName: true, phoneVerifiedAt: true, emailVerifiedAt: true, deletionScheduledAt: true },
    });
  }

  async revokeUser(input: {
    id: string;
    revokedPhone: string;
    displayName: string;
  }): Promise<void> {
    void input;
    throw new Error("Reviewer revoke refused: unsupported complete account/Session/device plan");
  }

  async deleteSessionsByUserIds(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    throw new Error("Reviewer rotation refused: unsupported complete account/Session/device plan");
  }

  async invalidatePushDevicesByUserIds(userIds: string[], invalidatedAt: Date): Promise<number> {
    void invalidatedAt;
    if (userIds.length === 0) return 0;
    throw new Error("Reviewer rotation refused: unsupported complete account/Session/device plan");
  }

  /** Full fixed-ID/slug and personal Listing association discovery precedes
   * every account/catalog/media effect in the command. */
  async preflightSeed(input: { catalog: ReviewerScenarioCatalog; listings: { id: string; sellerId: string }[] }): Promise<string | null> {
    const catalogFailure = await this.catalogAssociationFailure(this.prisma, input.catalog);
    if (catalogFailure) return catalogFailure;
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: input.listings.map(row => row.id) } }, select: { id: true, sellerId: true, businessId: true },
    });
    if (listings.some(row => row.businessId !== null || row.sellerId !== input.listings.find(target => target.id === row.id)?.sellerId)) {
      return "foreign Listing association";
    }
    return null;
  }

  private async catalogAssociationFailure(db: Prisma.TransactionClient | PrismaClient, input: ReviewerScenarioCatalog): Promise<string | null> {
    const brands = await db.brand.findMany({ where: { OR: [{ id: input.brandId }, { slug: input.brandSlug }] } });
    const models = await db.model.findMany({ where: { OR: [{ id: input.modelId }, { brandId: input.brandId, slug: input.modelSlug }] } });
    const regions = await db.region.findMany({ where: { OR: [{ id: input.regionId }, { slug: input.regionSlug }] } });
    const cities = await db.city.findMany({ where: { OR: [{ id: input.cityId }, { regionId: input.regionId, slug: input.citySlug }] } });
    if (brands.some(row => row.id !== input.brandId || row.slug !== input.brandSlug) ||
        models.some(row => row.id !== input.modelId || row.slug !== input.modelSlug || row.brandId !== input.brandId) ||
        regions.some(row => row.id !== input.regionId || row.slug !== input.regionSlug) ||
        cities.some(row => row.id !== input.cityId || row.slug !== input.citySlug || row.regionId !== input.regionId)) {
      return "foreign catalog association";
    }
    return null;
  }

  async upsertCatalog(input: ReviewerScenarioCatalog): Promise<void> {
    // Recheck in the catalog transaction so a concurrent collision cannot rename
    // foreign catalog rows. Whole-command preflight above still runs first.
    await this.prisma.$transaction(async tx => {
      const failure = await this.catalogAssociationFailure(tx, input);
      if (failure) throw new Error(`Reviewer seed refused: ${failure}`);
      await tx.brand.upsert({
        where: { slug: input.brandSlug },
        update: {
          nameRu: "Toyota (демо)",
          nameTk: "Toyota (demo)",
          nameEn: "Toyota (demo)",
        },
        create: {
          id: input.brandId,
          slug: input.brandSlug,
          nameRu: "Toyota (демо)",
          nameTk: "Toyota (demo)",
          nameEn: "Toyota (demo)",
        },
      });
      await tx.model.upsert({
        where: {
          brandId_slug: { brandId: input.brandId, slug: input.modelSlug },
        },
        update: {
          nameRu: "Camry Hybrid (демо)",
          nameTk: "Camry Hybrid (demo)",
          nameEn: "Camry Hybrid (demo)",
        },
        create: {
          id: input.modelId,
          brandId: input.brandId,
          slug: input.modelSlug,
          nameRu: "Camry Hybrid (демо)",
          nameTk: "Camry Hybrid (demo)",
          nameEn: "Camry Hybrid (demo)",
        },
      });
      await tx.region.upsert({
        where: { slug: input.regionSlug },
        update: {
          nameRu: "Review Region",
          nameTk: "Review Region",
          nameEn: "Review Region",
        },
        create: {
          id: input.regionId,
          slug: input.regionSlug,
          nameRu: "Review Region",
          nameTk: "Review Region",
          nameEn: "Review Region",
        },
      });
      await tx.city.upsert({
        where: {
          regionId_slug: { regionId: input.regionId, slug: input.citySlug },
        },
        update: {
          nameRu: "Review City",
          nameTk: "Review City",
          nameEn: "Review City",
        },
        create: {
          id: input.cityId,
          regionId: input.regionId,
          slug: input.citySlug,
          nameRu: "Review City",
          nameTk: "Review City",
          nameEn: "Review City",
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async upsertListing(input: {
    contactPhone: string;
    id: string;
    sellerId: string;
    priceAmount: number;
    description: string;
    publishedAt: Date;
    damaged: boolean;
    knownIssuesText: string | null;
  }): Promise<void> {
    await upsertMaintenanceListing(this.prisma, {
      ownership: { sellerId: input.sellerId, businessId: null },
      update: {
        sellerId: input.sellerId,
        status: "active",
        brandId: reviewerScenarioSeedIds.brandId,
        modelId: reviewerScenarioSeedIds.modelId,
        cityId: reviewerScenarioSeedIds.cityId,
        regionId: reviewerScenarioSeedIds.regionId,
        year: 2020,
        mileageKm: 72000,
        priceAmount: input.priceAmount,
        priceCurrency: "TMT",
        priceTmt: input.priceAmount,
        description: input.description,
        deletedAt: null,
        publishedAt: input.publishedAt,
        condition: "used",
        locationText: "Review City",
        allowCalls: false,
        allowChat: true,
        contactPhone: input.contactPhone,
        damaged: input.damaged,
        knownIssuesText: input.knownIssuesText,
      },
      create: {
        id: input.id,
        sellerId: input.sellerId,
        status: "active",
        brandId: reviewerScenarioSeedIds.brandId,
        modelId: reviewerScenarioSeedIds.modelId,
        cityId: reviewerScenarioSeedIds.cityId,
        regionId: reviewerScenarioSeedIds.regionId,
        year: 2020,
        mileageKm: 72000,
        priceAmount: input.priceAmount,
        priceCurrency: "TMT",
        priceTmt: input.priceAmount,
        description: input.description,
        publishedAt: input.publishedAt,
        condition: "used",
        locationText: "Review City",
        allowCalls: false,
        allowChat: true,
        contactPhone: input.contactPhone,
        damaged: input.damaged,
        knownIssuesText: input.knownIssuesText,
      },
    });
  }

  async upsertListingMedia(input: {
    id: string; listingId: string; key: string; sortOrder: number; fixtureIndex: number;
  }): Promise<void> {
    const dimensions = await uploadReviewerPhoto(input.key, input.fixtureIndex);
    const data = { listingId: input.listingId, kind: "image" as const, key: input.key, sortOrder: input.sortOrder, ...dimensions };
    await this.prisma.listingMedia.upsert({
      where: { id: input.id }, create: { id: input.id, ...data }, update: data,
    });
  }

  async upsertConversation(input: {
    id: string;
    listingId: string;
    buyerId: string;
    sellerId: string;
    lastMessageAt: Date;
    lastMessageId: string;
  }): Promise<void> {
    await this.prisma.conversation.upsert({
      where: { id: input.id },
      update: {
        listingId: input.listingId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        lastMessageAt: input.lastMessageAt,
        lastMessageId: input.lastMessageId,
      },
      create: input,
    });
  }

  async upsertConversationParticipant(input: {
    id: string;
    conversationId: string;
    userId: string;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  }): Promise<void> {
    await this.prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      update: {
        lastReadAt: input.lastReadAt,
        lastDeliveredAt: input.lastDeliveredAt,
      },
      create: input,
    });
  }

  async upsertMessage(input: {
    id: string;
    conversationId: string;
    senderId: string;
    kind: "text" | "post_ref";
    body: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }): Promise<void> {
    await this.prisma.message.upsert({
      where: { id: input.id },
      update: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        kind: input.kind,
        body: input.body,
        metadata: jsonOrDbNull(input.metadata),
        createdAt: input.createdAt,
        deletedAt: null,
      },
      create: { ...input, metadata: jsonOrDbNull(input.metadata) },
    });
  }

  async upsertContentReport(input: {
    id: string;
    reporterUserId: string;
    targetType: "listing";
    targetId: string;
    reason: "misleading";
    details: string;
  }): Promise<void> {
    await this.prisma.contentReport.upsert({
      where: { id: input.id },
      update: {
        reporterUserId: input.reporterUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details,
        status: "pending",
        reviewedById: null,
        reviewedAt: null,
        messageContext: Prisma.DbNull,
      },
      create: {
        id: input.id,
        reporterUserId: input.reporterUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details,
        status: "pending",
      },
    });
  }

  async createAuditLog(input: {
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        details: input.details as Prisma.InputJsonValue,
      },
    });
  }
}
