import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import type { BusinessAuthorityRepository, BusinessAuthoritySnapshot } from "../domain/ports/BusinessAuthorityRepository";
@Injectable()
export class PrismaBusinessAuthority implements BusinessAuthorityRepository {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 async current(input: BusinessSubject): Promise<BusinessAuthoritySnapshot | null> {
  const session = await this.prisma.session.findUnique({ where: { id: input.sessionId }, include: { user: { include: { dealershipMemberships: { include: { dealership: true } } } } } });
  if (!session) return null;
  const member = session.user.dealershipMemberships[0];
  return { userId: session.userId, expiresAt: session.expiresAt, suspended: !!session.user.suspendedAt, deleting: !!session.user.deletionScheduledAt,
   membership: member ? { id: member.id, businessId: member.dealershipId, role: member.role, active: member.status === "active", status: member.dealership.status as "active" | "suspended" | "recovery" } : null };
 }
}
