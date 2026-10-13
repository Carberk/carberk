import { describe, expect, it } from "vitest";

import {
  FavoriteListingSummarySchema,
  FeedListingSummarySchema,
  ListingSummarySchema,
} from "./listings";

// What the Listing detail preview needs to place every field before detail
// loads (#867): all optional, so an older API's summary still parses.
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  sellerId: "00000000-0000-4000-8000-000000000002",
  status: "active",
  brandId: "00000000-0000-4000-8000-000000000003",
  modelId: "00000000-0000-4000-8000-000000000004",
  priceAmount: 1000,
  priceCurrency: "TMT",
  displayPriceTmt: 1000,
  photoKeys: [],
  photoCount: 0,
  cityId: "00000000-0000-4000-8000-000000000005",
  publishedAt: "2026-10-01T00:00:00.000Z",
};
const previewFields = {
  enginePower: 150,
  driveTypeId: "00000000-0000-4000-8000-000000000006",
  bodyTypeId: "00000000-0000-4000-8000-000000000007",
  colorId: "00000000-0000-4000-8000-000000000008",
  hasVin: true,
  acceptsExchange: true,
  installmentAvailable: false,
  allowCalls: false,
  allowChat: true,
};

describe("Listing summary fields for the detail preview", () => {
  it.each([
    ["ListingSummary", ListingSummarySchema, {}],
    ["FeedListingSummary", FeedListingSummarySchema, {}],
    ["FavoriteListingSummary", FavoriteListingSummarySchema, { allowCalls: false, allowChat: true }],
  ] as const)("%s keeps power, drive, body, colour, VIN presence, exchange, installment and contact preferences", (_name, schema, required) => {
    expect(schema.parse({ ...base, ...required, ...previewFields })).toMatchObject(previewFields);
  });

  it("still parses a summary from an older API without them", () => {
    const parsed = ListingSummarySchema.parse(base);

    for (const field of Object.keys(previewFields)) expect(parsed).not.toHaveProperty(field);
  });

  it("never carries the VIN itself", () => {
    expect(ListingSummarySchema.parse({ ...base, vin: "JTDKB20U793456789" })).not.toHaveProperty("vin");
  });
});
