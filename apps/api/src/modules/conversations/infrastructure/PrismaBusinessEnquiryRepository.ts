import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { BUSINESS_AUTHORITY_PORT, BusinessAuthorityDenied, type BusinessAuthorityPort } from "../../identity/identity.public";
import { BusinessEnquiryAccess } from "../application/BusinessEnquiryAccess";
import { ConversationDomainError } from "../domain/types";
import type { BusinessEnquiryRepository, ConversationActor, EnquiryResponsibilityChange } from "../domain/ports/BusinessEnquiryRepository";
import { toDomainConversation } from "./ConversationMapper";

@Injectable()
export class PrismaBusinessEnquiryRepository implements BusinessEnquiryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly authority: BusinessAuthorityPort,
    @Inject(BusinessEnquiryAccess) private readonly access: BusinessEnquiryAccess) {}

  private async member(actor: ConversationActor, tx: Prisma.TransactionClient, owner = false, history = true) {
    if (!actor.businessId || !actor.sessionId) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "BUSINESS_CONTEXT_CHANGED" } });
    try { return await this.authority.authorize({ userId: actor.userId, sessionId: actor.sessionId, businessId: actor.businessId, owner, history: !owner && history }, tx); }
    catch (error) { if (error instanceof BusinessAuthorityDenied) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: error.reason } }); throw error; }
  }

  async list(actor: ConversationActor, cursor?: string) {
    return this.prisma.$transaction(async tx => {
      await this.member(actor, tx);
      const rows = await tx.conversation.findMany({ where: { businessId: actor.businessId ?? "" }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      const page = rows.slice(0, 50);
      const unanswered = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM conversations c LEFT JOIN messages m ON m.id = c."lastMessageId" WHERE c."businessId" = ${actor.businessId} AND c."enquiryState" = 'open' AND (m.id IS NULL OR m."senderId" = c."buyerId")`;
      return { items: page.map(toDomainConversation), nextCursor: rows.length > 50 ? page.at(-1)?.id ?? null : null, unanswered: Number(unanswered[0]?.count ?? 0) };
    });
  }

  async change(input: EnquiryResponsibilityChange) {
    return this.prisma.$transaction(async tx => {
      // Reassignment and revocation both take User locks before the business.
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${input.actor.userId}, ${input.assigneeId ?? input.actor.userId}) ORDER BY id FOR UPDATE`;
      const principal = await this.member(input.actor, tx, input.action !== "claim", false);
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${input.conversationId} FOR UPDATE`;
      const row = await tx.conversation.findUnique({ where: { id: input.conversationId } });
      if (!row || row.businessId !== input.actor.businessId) throw new NotFoundException({ code: "NOT_FOUND" });
      const before = toDomainConversation(row);
      await this.access.authorize(before, input.actor, { owner: input.action !== "claim", transaction: tx });
      let next;
      try { next = before.changeResponsibility({ actorId: input.actor.userId, owner: principal.role === "owner", expectedVersion: input.expectedVersion, action: input.action, assigneeId: input.assigneeId }); }
      catch (error) { if (error instanceof ConversationDomainError) throw new ConflictException({ code: error.code, message: error.message }); throw error; }
      if (next.assigneeId) {
        const target = await tx.dealershipMember.findUnique({ where: { userId: next.assigneeId }, include: { user: true } });
        if (!target || target.dealershipId !== before.businessId || target.status !== "active" || target.user.suspendedAt || target.user.deletionScheduledAt) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "MEMBERSHIP_REQUIRED" } });
      }
      const saved = await tx.conversation.update({ where: { id: row.id }, data: { assigneeId: next.assigneeId, enquiryState: next.enquiryState, version: next.version } });
      await tx.businessEnquiryAudit.create({ data: { conversationId: row.id, version: next.version, actorId: input.actor.userId, action: input.action, previousAssigneeId: before.assigneeId, assigneeId: next.assigneeId, enquiryState: next.enquiryState } });
      return toDomainConversation(saved);
    });
  }

  async audit(actor: ConversationActor, conversationId: string) {
    return this.prisma.$transaction(async tx => {
      await this.member(actor, tx);
      const conversation = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation || conversation.businessId !== actor.businessId) throw new NotFoundException({ code: "NOT_FOUND" });
      return (await tx.businessEnquiryAudit.findMany({ where: { conversationId }, orderBy: { version: "asc" } })).map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }

  async businessName(businessId: string) { return (await this.prisma.dealership.findUnique({ where: { id: businessId }, select: { name: true } }))?.name ?? null; }

  async recipients(conversationId: string, senderId: string): Promise<string[]> {
    const row = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { business: true, buyer: true } });
    if (!row?.businessId || row.business?.status !== "active") return [];
    if (senderId !== row.buyerId) return row.buyer.suspendedAt || row.buyer.deletionScheduledAt ? [] : [row.buyerId];
    const members = await this.prisma.dealershipMember.findMany({ where: { dealershipId: row.businessId, status: "active", ...(row.assigneeId ? { userId: row.assigneeId } : {}), user: { suspendedAt: null, deletionScheduledAt: null } }, select: { userId: true } });
    return members.map(member => member.userId);
  }
}
