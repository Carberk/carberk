import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { ListingAuditEntry, ListingAuditLog } from "../application/ports/ListingAuditLog";

@Injectable()
export class PrismaListingAuditLog implements ListingAuditLog {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: ListingAuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }
}
