import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { CatalogAuditEntry, CatalogAuditLog } from "../application/ports/CatalogAuditLog";

@Injectable()
export class PrismaCatalogAuditLog implements CatalogAuditLog {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: CatalogAuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }
}
