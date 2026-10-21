import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@auto-tm/db";
import { StaffSchemas } from "@auto-tm/contracts";
import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import type { StaffBindingPort, StaffBindingSubject, StaffBinding } from "../domain/ports/StaffBindingPort";

/** Identity owns access to current participant grants and issuer Session facts. */
@Injectable()
export class PrismaStaffBindings implements StaffBindingPort {
  async bind(subjects: StaffBindingSubject[], transaction: unknown): Promise<StaffBinding[]> {
    const tx = transaction as Prisma.TransactionClient;
    for (const id of [...new Set(subjects.map(subject => subject.userId))].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id=${id} FOR UPDATE`;
    for (const id of [...new Set(subjects.flatMap(subject => subject.sessionId ? [subject.sessionId] : []))].sort()) await tx.$queryRaw`SELECT id FROM sessions WHERE id=${id} FOR UPDATE`;
    for (const subject of [...subjects].sort((a,b) => a.userId.localeCompare(b.userId) || a.capability.localeCompare(b.capability))) {
      await tx.$queryRaw`SELECT "userId" FROM staff_grants WHERE "userId"=${subject.userId} AND capability=${subject.capability} FOR SHARE`;
    }
    const result: StaffBinding[] = [];
    for (const subject of subjects) {
      const user = await tx.user.findUnique({ where: { id: subject.userId } });
      const grant = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: subject.userId, capability: subject.capability } } });
      if (!user || user.suspendedAt || user.deletionScheduledAt) throw new StaffAuthorityDenied("USER_INACTIVE");
      if (!StaffSchemas.StaffCapabilitySchema.safeParse(subject.capability).success || !grant || grant.revokedAt) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED");
      const session = subject.sessionId ? await tx.session.findUnique({ where: { id: subject.sessionId } }) : null;
      // Session/elevation time is checked by the public acting-authority port using its injected
      // clock. Here the exact locked values are bound; a participant has no invented Session.
      if (subject.sessionId && (!session || session.userId !== subject.userId)) throw new StaffAuthorityDenied("SESSION_REQUIRED");
      result.push({ userId: subject.userId, capability: subject.capability, generation: createHash("sha256").update(JSON.stringify([
        user.id, user.suspendedAt, user.deletionScheduledAt, grant.userId, grant.capability, grant.grantedAt, grant.revokedAt,
        session && [session.id, session.userId, session.expiresAt, session.adminTotpExpiresAt],
      ])).digest("hex") });
    }
    return result;
  }
}
