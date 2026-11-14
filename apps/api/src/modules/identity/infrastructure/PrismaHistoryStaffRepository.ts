import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { HistoryStaffRepository, HistoryStaffStore, StaffSession } from "../domain/ports/HistoryStaffRepository";
import type { StaffActor } from "../domain/ports/StaffAccessPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { SystemClockAdapter } from "./SystemClockAdapter";

@Injectable()
export class PrismaHistoryStaffRepository implements HistoryStaffRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SystemClockAdapter) private readonly clock: ClockPort) {}

  asFounder<T>(session: StaffSession, targetId: string | undefined,
    work: (store: HistoryStaffStore, actor: StaffActor) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Stable lock order also serializes concurrent changes to the same target.
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${session.userId}, ${targetId ?? session.userId}) ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${session.sessionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "userId" FROM staff_grants WHERE "userId" = ${session.userId} FOR UPDATE`;
      const now = this.clock.now();
      const current = await tx.session.findFirst({ where: {
        id: session.sessionId, userId: session.userId, expiresAt: { gt: now }, adminTotpExpiresAt: { gt: now },
        user: { suspendedAt: null, deletionScheduledAt: null,
          OR: [{ phone: { not: null } }, { email: { not: null } }],
          staffGrants: { some: { purpose: "vehicle_history_staff_management", revokedAt: null, grantedAt: { lte: now } } } },
      }, select: { user: { select: { id: true, displayName: true, nameNumber: true } } } });
      if (!current) throw new ForbiddenException({ code: "HISTORY_ACCESS_DENIED", message: "Current founder authority required" });
      return work({
        change: async ({ targetId: userId, capability, active, reason }) => {
          const purpose = capability === "vehicle-history" ? "vehicle_history" : "vehicle_history_payment_evidence";
          if (active) await tx.staffGrant.upsert({ where: { userId_purpose: { userId, purpose } },
            create: { userId, purpose, grantedAt: now }, update: { grantedAt: now, revokedAt: null } });
          else await tx.staffGrant.updateMany({ where: { userId, purpose }, data: { revokedAt: now } });
          await tx.auditLog.create({ data: { actorId: current.user.id, targetType: "User", targetId: userId,
            action: active ? "HISTORY_STAFF_GRANT" : "HISTORY_STAFF_REVOKE", details: { capability, reason } } });
        },
        findTarget: async (id) => {
          const user = await tx.user.findUnique({ where: { id }, select: {
            id: true, displayName: true, nameNumber: true, suspendedAt: true, deletionScheduledAt: true,
            phone: true, email: true, staffGrants: { where: { revokedAt: null, grantedAt: { lte: now } }, select: { purpose: true } },
          } });
          if (!user) return null;
          return { id: user.id, displayName: user.displayName, nameNumber: user.nameNumber,
            eligible: !user.suspendedAt && !user.deletionScheduledAt && Boolean(user.phone || user.email),
            capabilities: { "vehicle-history": user.staffGrants.some((g) => g.purpose === "vehicle_history"),
              "vehicle-history-payment-evidence": user.staffGrants.some((g) => g.purpose === "vehicle_history_payment_evidence") } };
        },
      }, current.user);
    });
  }
}
