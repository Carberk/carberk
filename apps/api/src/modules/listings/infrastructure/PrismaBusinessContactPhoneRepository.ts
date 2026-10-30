import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { BUSINESS_AUTHORITY_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import { withBusinessContactPreparation } from "../../../common/avatar-contact-preparation";
import { VerifiedContactPhone } from "../domain/VerifiedContactPhone";
import type { BusinessContactPhoneRepository } from "../domain/ports/BusinessContactPhoneRepository";
import type { InventoryActor } from "../domain/ports/ListingRepository";

@Injectable()
export class PrismaBusinessContactPhoneRepository implements BusinessContactPhoneRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly authority: BusinessAuthorityPort) {}
  async find(businessId: string, transaction?: unknown): Promise<VerifiedContactPhone | null> {
    const db = (transaction as Prisma.TransactionClient | undefined) ?? this.prisma;
    const row = await db.dealership.findUnique({ where: { id: businessId } });
    return row?.contactPhone && row.contactConfirmedAt ? VerifiedContactPhone.create({ sellerId: businessId, phone: row.contactPhone, confirmedAt: row.contactConfirmedAt }) : null;
  }
  async record(confirmation: VerifiedContactPhone, actor: InventoryActor): Promise<VerifiedContactPhone> {
    if (!actor.sessionId || actor.businessId !== confirmation.sellerId) throw new Error("Business contact requires explicit current actor");
    const sessionId = actor.sessionId;
    await this.prisma.$transaction(async (tx) => withBusinessContactPreparation(tx, {
      userId: actor.userId, sessionId, businessId: confirmation.sellerId, phone: confirmation.phone, confirmedAt: confirmation.confirmedAt,
    }, async () => {
      await this.authority.authorize({ userId: actor.userId, sessionId, businessId: confirmation.sellerId, owner: true }, tx);
      await tx.dealership.update({ where: { id: confirmation.sellerId }, data: { contactPhone: confirmation.phone, contactConfirmedAt: confirmation.confirmedAt } });
    }));
    return confirmation;
  }
}
