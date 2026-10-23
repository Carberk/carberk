import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import type { BusinessAuthorityRepository, BusinessAuthoritySnapshot } from "../domain/ports/BusinessAuthorityRepository";
@Injectable()
export class PrismaBusinessAuthority implements BusinessAuthorityRepository {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 async current(input: BusinessSubject, transaction?: unknown): Promise<BusinessAuthoritySnapshot | null> {
  const db = (transaction as Prisma.TransactionClient | undefined) ?? this.prisma;
  if (transaction) {
   await db.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`;
   const member = await db.dealershipMember.findUnique({ where: { userId: input.userId } });
   if (member) await db.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id" = ${member.dealershipId} FOR UPDATE`;
  }
  const session = await db.session.findUnique({ where: { id: input.sessionId }, include: { user: { include: { dealershipMemberships: { include: { dealership: true } } } } } });
  if (!session) return null;
  const member = session.user.dealershipMemberships[0];
  return { userId: session.userId, expiresAt: session.expiresAt, suspended: !!session.user.suspendedAt, deleting: !!session.user.deletionScheduledAt,
   membership: member ? { id: member.id, businessId: member.dealershipId, role: member.role, active: member.status === "active", status: member.dealership.status as "active" | "suspended" | "recovery" } : null };
 }
}
