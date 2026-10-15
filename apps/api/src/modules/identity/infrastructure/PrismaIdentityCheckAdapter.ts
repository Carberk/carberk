import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";

@Injectable()
export class PrismaIdentityCheckAdapter implements IdentityCheckPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isAdmin(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return row?.role === "admin";
  }

  async isInDealership(
    userId: string,
    dealershipId: string,
  ): Promise<boolean> {
    const row = await this.prisma.dealershipMember.findUnique({
      where: { userId },
      select: { dealershipId: true, status: true, user: { select: { suspendedAt: true, deletionScheduledAt: true } }, dealership: { select: { status: true } } },
    });
    return !!row && row.dealershipId === dealershipId && row.status === "active" && row.dealership.status === "active" && !row.user.suspendedAt && !row.user.deletionScheduledAt;
  }

  async isSuspended(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { suspendedAt: true },
    });
    return row?.suspendedAt != null;
  }

  async isDeletionScheduled(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledAt: true },
    });
    return row?.deletionScheduledAt != null;
  }

  async holdsSignInPhone(userId: string, phone: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    return row?.phone != null && row.phone === phone;
  }
}
