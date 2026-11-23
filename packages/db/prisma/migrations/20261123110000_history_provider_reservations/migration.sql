ALTER TABLE "vehicle_history_orders"
  ADD COLUMN "reservedProvider" TEXT,
  ADD CONSTRAINT "vehicle_history_orders_reserved_provider_check" CHECK (
    "reservedProvider" IS NULL OR (
      "reservedProvider" IN ('Carfax', 'AutoCheck') AND COALESCE(
        "snapshot"->'acceptedOffer'->'preflight'->'providers'
          @> jsonb_build_array(jsonb_build_object('name', "reservedProvider")), FALSE
      )
    )
  ) NOT VALID;
