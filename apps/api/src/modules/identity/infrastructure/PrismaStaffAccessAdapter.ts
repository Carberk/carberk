import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { StaffAccessPort, StaffActor } from "../domain/ports/StaffAccessPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import { SystemClockAdapter } from "./SystemClockAdapter";

@Injectable()
export class PrismaStaffAccessAdapter implements StaffAccessPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SystemClockAdapter) private readonly clock: ClockPort,
  ) {}

  async findCurrentActor(input: Parameters<StaffAccessPort["findCurrentActor"]>[0]): Promise<StaffActor | null> {
    return this.findActor(input, true);
  }

  async findEligibleActor(input: Parameters<StaffAccessPort["findEligibleActor"]>[0]): Promise<StaffActor | null> {
    return this.findActor(input, false);
  }

  private async findActor(input: Parameters<StaffAccessPort["findCurrentActor"]>[0], elevated: boolean): Promise<StaffActor | null> {
    if (input.purpose !== "vehicle-history") return null;
    const now = this.clock.now();
    const session = await this.prisma.session.findFirst({
      where: {
        id: input.sessionId, userId: input.userId,
        expiresAt: { gt: now }, ...(elevated ? { adminTotpExpiresAt: { gt: now } } : {}),
        user: {
          suspendedAt: null, deletionScheduledAt: null,
          OR: [{ phone: { not: null } }, { email: { not: null } }],
          staffGrants: { some: { purpose: "vehicle_history", revokedAt: null, grantedAt: { lte: now } } },
        },
      },
      select: { user: { select: { id: true, displayName: true, nameNumber: true } } },
    });
    return session?.user ?? null;
  }
}
