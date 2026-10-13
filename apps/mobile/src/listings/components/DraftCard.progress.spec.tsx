import type { ListingsSchemas } from "@auto-tm/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";

import { DraftCard } from "./DraftCard";

// Native progress animations need a device. Keep its supplied value queryable.
vi.mock("@/components/ui/progress", async () => {
  const { View } = await import("react-native");
  return { Progress: ({ value }: { value: number }) => (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: value }} />
  ) };
});

const id = "550e8400-e29b-41d4-a716-446655440000";
const contact = { contactPhone: "+99361234567", allowCalls: true, allowChat: true };
const savedFields = {
  brandId: id, modelId: id, year: 2020,
  priceAmount: 100000, priceCurrency: "TMT" as const,
  ...contact,
};
function card(payload: ListingsSchemas.ListingDraft["payload"]) {
  const draft: ListingsSchemas.ListingDraft = {
    id, userId: id, payload, createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z",
  };
  return <DraftCard draft={draft} onResume={vi.fn()} onMore={vi.fn()} />;
}

describe("DraftCard rendered progress", () => {
  it.each([
    { payload: savedFields, filled: 3, percent: 43 },
    { payload: { ...savedFields, currentStep: 1, validatedSteps: [] }, filled: 3, percent: 43 },
    { payload: { ...savedFields, currentStep: 8, validatedSteps: ["vin", "review", "gone"] }, filled: 3, percent: 43 },
    { payload: { currentStep: 7, validatedSteps: ["vehicle", "specs", "photos", "price", "location", "contact"] }, filled: 0, percent: 0 },
    { payload: {}, filled: 0, percent: 0 },
    { payload: { brandId: id }, filled: 0, percent: 0 },
    { payload: contact, filled: 1, percent: 14 },
  ])("renders $filled of 7 and $percent% from saved fields", async ({ payload, filled, percent }) => {
    const screen = await renderMobile(card(payload));
    expect(screen.getByText(`${filled} of 7 steps filled`)).toBeTruthy();
    expect(screen.getByText(`${percent}%`)).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(percent);
  });

  it("lowers both the label and bar when saved fields are invalidated", async () => {
    const payload = { ...savedFields, currentStep: 7, validatedSteps: ["vehicle", "price", "contact"] };
    const screen = await renderMobile(card(payload));
    expect(screen.getByText("3 of 7 steps filled")).toBeTruthy();
    await screen.rerender(card({ ...payload, priceAmount: 0 }));
    expect(screen.getByText("2 of 7 steps filled")).toBeTruthy();
    expect(screen.getByText("29%")).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(29);
  });
});
