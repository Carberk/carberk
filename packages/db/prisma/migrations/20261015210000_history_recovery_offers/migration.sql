-- AlterTable
ALTER TABLE "history_orders" ADD COLUMN     "recoveryOfferExpiresAt" TIMESTAMP(3),
ADD COLUMN     "recoveryOfferedAt" TIMESTAMP(3),
ADD COLUMN     "recoveryOfferedDeadline" TIMESTAMP(3);

ALTER TABLE history_orders ADD CONSTRAINT history_recovery_offer_bounded CHECK (
 ("recoveryOfferedAt" IS NULL AND "recoveryOfferedDeadline" IS NULL AND "recoveryOfferExpiresAt" IS NULL) OR
 ("recoveryOfferedAt" IS NOT NULL AND "recoveryOfferedDeadline" IS NOT NULL AND "recoveryOfferExpiresAt" IS NOT NULL AND
  "recoveryOfferExpiresAt" > "recoveryOfferedAt" AND "recoveryOfferExpiresAt" <= "recoveryOfferedAt" + interval '60 seconds' AND
  "recoveryOfferedDeadline" > "recoveryOfferedAt")
);
