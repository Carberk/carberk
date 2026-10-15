import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { Prisma } from "@auto-tm/db";

import { ListingDraft } from "../domain/ListingDraft";
import type { ListingDraftRepository } from "../domain/ports/ListingDraftRepository";

const DRAFT_LIMIT_TRANSACTION = { maxWait: 5_000, timeout: 5_000 } as const;

@Injectable()
export class PrismaListingDraftRepository implements ListingDraftRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership) {}

  async save(draft: ListingDraft): Promise<ListingDraft> {
    const row = await this.prisma.listingDraft.create({
      data: {
        id: draft.id,
        userId: draft.userId,
        businessId: draft.businessId ?? null,
        payload: draft.payload as Prisma.InputJsonValue,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    });
    return this.toDomain(row);
  }

  async saveWithinLimit(draft: ListingDraft, limit: number, actor?: ListingActor): Promise<ListingDraft | null> {
    return this.prisma.$transaction(async (tx) => {
      // Prisma cannot finish rollback while adapter-pg has an in-flight lock wait.
      // PostgreSQL cancels the statement before the five-second transaction deadline.
      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
      // Locking the owner row serializes this User's creates, so two requests
      // cannot both count four drafts and each add a fifth.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${draft.userId} FOR UPDATE`;
      if (draft.businessId) {
        if (!actor) throw new Error("Business draft requires current actor");
        await assertListingOwnership(this.ownership, actor, draft, tx);
      }
      const owned = await tx.listingDraft.count({ where: draft.businessId ? { businessId: draft.businessId } : { userId: draft.userId, businessId: null } });
      if (owned >= limit) return null;
      const row = await tx.listingDraft.create({
        data: {
          id: draft.id,
          userId: draft.userId,
        businessId: draft.businessId ?? null,
          payload: draft.payload as Prisma.InputJsonValue,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        },
      });
      return this.toDomain(row);
    }, DRAFT_LIMIT_TRANSACTION);
  }

  async findById(id: string): Promise<ListingDraft | null> {
    const row = await this.prisma.listingDraft.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByUserId(
    userId: string,
    opts?: { cursor?: { timestamp: string; id: string } | undefined; limit?: number | undefined },
  ): Promise<{ items: ListingDraft[]; nextCursor?: { timestamp: string; id: string } | undefined }> {
    const take = (opts?.limit ?? 20) + 1;

    const rows = await this.prisma.listingDraft.findMany({
      where: { userId, businessId: null },
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
    const nextCursor = hasMore && last
      ? { timestamp: last.updatedAt.toISOString(), id: last.id }
      : undefined;

    return { items: items.map((r) => this.toDomain(r as { id: string; userId: string; payload: unknown; createdAt: Date; updatedAt: Date })), nextCursor };
  }

  async update(draft: ListingDraft, actor?: ListingActor): Promise<ListingDraft> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (draft.businessId) {
        if (!actor) throw new Error("Business draft requires current actor");
        await assertListingOwnership(this.ownership, actor, draft, tx);
      }
      return tx.listingDraft.update({
      where: { id: draft.id },
      data: {
        payload: draft.payload as Prisma.InputJsonValue,
        updatedAt: draft.updatedAt,
      },
    });
    });
    return this.toDomain(row);
  }

  async delete(id: string, actor?: ListingActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const draft = await tx.listingDraft.findUnique({ where: { id } });
      if (draft?.businessId) {
        if (!actor) throw new Error("Business draft requires current actor");
        await assertListingOwnership(this.ownership, actor, { userId: draft.userId, businessId: draft.businessId }, tx);
      }
      await tx.listingDraft.delete({ where: { id } });
    });
  }

  private toDomain(row: {
    id: string;
    userId: string;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
    businessId?: string | null;
  }): ListingDraft {
    return new ListingDraft(
      row.id,
      row.userId,
      row.payload as Record<string, unknown>,
      row.createdAt,
      row.updatedAt,
      row.businessId ?? undefined,
    );
  }
}
