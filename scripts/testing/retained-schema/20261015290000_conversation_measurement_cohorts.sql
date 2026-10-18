-- Additive, nullable references. No historical acceptance backfill.
-- Rollback: disable source emission/revert application while retaining these columns.
-- Dropping columns, if ever needed, requires a later forward migration after readers retire.
ALTER TABLE "conversations"
  ADD COLUMN "firstBuyerMessageId" TEXT,
  ADD COLUMN "firstSellerReplyId" TEXT;
