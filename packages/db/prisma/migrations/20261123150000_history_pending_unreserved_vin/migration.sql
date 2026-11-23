ALTER TABLE "history_vin_agreements"
  ALTER COLUMN "reservedProvider" DROP NOT NULL,
  ADD CONSTRAINT "history_vin_agreements_final_reservation_check" CHECK (
    "reservedProvider" IS NOT NULL OR COALESCE(input->>'kind' IN ('request', 'review'), FALSE)
  ) NOT VALID;
