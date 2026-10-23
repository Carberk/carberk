import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@auto-tm/db";
import { BusinessAuthorityDenied } from "../domain/ports/BusinessAuthorityPort";
import { publisherParticipant } from "../domain/PublisherParticipant";
import type { PublisherBindingPort, PublisherParticipants } from "../domain/ports/PublisherBindingPort";

/** Locks the whole User union before any Business, including acting staff's personal-context
 * BusinessAuthority.resolve targets. Membership writers use User -> Business as well. */
@Injectable()
export class PrismaPublisherBindings implements PublisherBindingPort {
  async lock(input: PublisherParticipants, transaction: unknown): Promise<PublisherParticipants> {
    const tx = transaction as Prisma.TransactionClient;
    const userIds = [...new Set(input.userIds)].sort();
    for (const id of userIds) await tx.$queryRaw`SELECT id FROM users WHERE id=${id} FOR UPDATE`;
    const memberships = await tx.dealershipMember.findMany({ where: { userId: { in: userIds } } });
    const businessIds = [...new Set([...input.businessIds, ...memberships.map(member => member.dealershipId)])].sort();
    for (const id of businessIds) await tx.$queryRaw`SELECT id FROM dealerships WHERE id=${id} FOR UPDATE`;
    const current = await tx.dealershipMember.findMany({ where: { userId: { in: userIds } } });
    if (current.some(member => !businessIds.includes(member.dealershipId))) throw new BusinessAuthorityDenied("MEMBERSHIP_CONFLICT");
    return { userIds, businessIds };
  }
  async bind(input: { userId: string; sellerId: string; businessId: string | null }, locked: PublisherParticipants, transaction: unknown) {
    const tx = transaction as Prisma.TransactionClient;
    if (!locked.userIds.includes(input.userId) || !locked.userIds.includes(input.sellerId) ||
      (input.businessId && !locked.businessIds.includes(input.businessId))) throw new BusinessAuthorityDenied("MEMBERSHIP_CONFLICT");
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    const member = await tx.dealershipMember.findUnique({ where: { userId: input.userId } });
    if (member && !locked.businessIds.includes(member.dealershipId)) throw new BusinessAuthorityDenied("MEMBERSHIP_CONFLICT");
    const business = input.businessId ? await tx.dealership.findUnique({ where: { id: input.businessId } }) : null;
    if (!user) throw new BusinessAuthorityDenied("USER_INACTIVE");
    if (input.businessId && (!business || !member)) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
    publisherParticipant({ userId: user.id, active: !user.suspendedAt && !user.deletionScheduledAt,
      membership: member && { id: member.id, businessId: member.dealershipId, active: member.status === "active", role: member.role, businessStatus: business?.status ?? "missing" } }, input);
    return { ...input, membershipId: input.businessId ? member?.id ?? null : null,
      // Permanent unused-proof invalidation is source-triggered, including membership revoke/restore.
      // The digest alone is not a monotonic generation.
      generation: createHash("sha256").update(JSON.stringify([user.id, user.suspendedAt, user.deletionScheduledAt,
        input.businessId && [business?.id, business?.status, member?.id, member?.userId, member?.dealershipId, member?.role, member?.status, member?.createdAt]])).digest("hex") };
  }
}
