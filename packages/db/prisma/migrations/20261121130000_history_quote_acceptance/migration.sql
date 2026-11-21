CREATE TABLE "vehicle_history_orders" (
  "requestId" TEXT PRIMARY KEY REFERENCES "vehicle_history_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id" UUID NOT NULL UNIQUE,
  "snapshot" JSONB NOT NULL,
  "wallet" TEXT NOT NULL CHECK ("wallet" ~ '^SYNTHETIC-[A-Z0-9-]{1,64}$'),
  "deliveryDay" TEXT NOT NULL CHECK ("deliveryDay" ~ '^\d{4}-\d{2}-\d{2}$'),
  "deliveryFrom" TIMESTAMPTZ(3) NOT NULL,
  "deliveryBy" TIMESTAMPTZ(3) NOT NULL,
  "holdExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  CHECK ("deliveryBy" > "deliveryFrom"),
  CHECK ("snapshot"->>'id' = "id"::text),
  CHECK ("snapshot"->>'deliveryDay' = "deliveryDay"),
  CHECK (("snapshot"->>'holdExpiresAt')::timestamptz = "holdExpiresAt"),
  CHECK (("snapshot"->'acceptedOffer'->'proposal'->>'deliveryFrom')::timestamptz = "deliveryFrom"),
  CHECK (("snapshot"->'acceptedOffer'->'proposal'->>'deliveryBy')::timestamptz = "deliveryBy"),
  CHECK ("snapshot"->'acceptedOffer'->'proposal'->>'format' IN ('pdf', 'link', 'both'))
);
CREATE INDEX "vehicle_history_orders_deliveryDay_holdExpiresAt_idx" ON "vehicle_history_orders"("deliveryDay", "holdExpiresAt");
CREATE RULE history_order_immutable AS ON UPDATE TO vehicle_history_orders DO INSTEAD NOTHING;
