import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import { withVerifiedContactPreparation } from "../../../common/avatar-contact-preparation";

import { VerifiedContactPhone } from "../domain/VerifiedContactPhone";
import type { VerifiedContactPhoneRepository } from "../domain/ports/VerifiedContactPhoneRepository";

type Row = { sellerId: string; phone: string; confirmedAt: Date };

@Injectable()
export class PrismaVerifiedContactPhoneRepository implements VerifiedContactPhoneRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async find(sellerId: string, phone: string): Promise<VerifiedContactPhone | null> {
    const row = await this.prisma.verifiedContactPhone.findUnique({
      where: { sellerId_phone: { sellerId, phone } },
    });
    return row ? this.toDomain(row) : null;
  }

  async record(confirmation: VerifiedContactPhone): Promise<VerifiedContactPhone> {
    const { sellerId, phone, confirmedAt } = confirmation;
    const row = await this.prisma.$transaction(tx => withVerifiedContactPreparation(tx, confirmation, id => tx.verifiedContactPhone.upsert({
      where: { sellerId_phone: { sellerId, phone } },
      create: { id, sellerId, phone, confirmedAt },
      update: { confirmedAt },
    })));
    return this.toDomain(row);
  }

  async listBySeller(sellerId: string): Promise<VerifiedContactPhone[]> {
    const rows = await this.prisma.verifiedContactPhone.findMany({
      where: { sellerId },
      orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: Row): VerifiedContactPhone {
    return VerifiedContactPhone.create(row);
  }
}
