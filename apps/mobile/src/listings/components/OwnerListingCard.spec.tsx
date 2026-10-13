import type { ListingsSchemas } from "@auto-tm/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent } from "../../../test/render";

import { OwnerListingCard } from "./OwnerListingCard";

function listing(status: ListingsSchemas.ListingSummary["status"]): ListingsSchemas.ListingSummary {
  return {
    id: "camry-1", sellerId: "me", status, brandId: "toyota", modelId: "camry", year: 2018, priceAmount: 1,
    priceCurrency: "TMT", displayPriceTmt: 100000, photoKeys: [], photoCount: 0, cityId: "city",
    publishedAt: "2026-09-30T04:00:00.000Z",
  };
}
async function renderCard(status: ListingsSchemas.ListingSummary["status"]) {
  const onOpen = vi.fn();
  const onMore = vi.fn();
  const view = await renderMobile(
    <OwnerListingCard listing={listing(status)} brandName="Toyota" modelName="Camry" cityName="Ashgabat" onOpen={onOpen} onMore={onMore} />,
  );
  return { view, onOpen, onMore };
}

describe("OwnerListingCard", () => {
  it("opens the Listing on tap and hands ⋯ its title", async () => {
    const { view, onOpen, onMore } = await renderCard("active");
    expect(view.getByText("Ashgabat")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Toyota Camry, 2018" }));
    expect(onOpen).toHaveBeenCalledWith("camry-1");
    await fireEvent.press(view.getByRole("button", { name: "Actions for Toyota Camry, 2018" }));
    expect(onMore).toHaveBeenCalledWith(expect.objectContaining({ id: "camry-1" }), "Toyota Camry, 2018");
  });

  it.each([
    ["sold", "Sold"],
    ["archived", "Removed from sale"],
  ] as const)("labels a %s Listing and keeps its actions", async (status, label) => {
    const { view } = await renderCard(status);
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByRole("button", { name: `Toyota Camry, 2018, ${label}` })).toBeTruthy();
    expect(view.getByRole("button", { name: "Actions for Toyota Camry, 2018" })).toBeTruthy();
  });

  it("shows a blocked Listing with a neutral note, no ⋯ and no tap", async () => {
    const { view, onOpen } = await renderCard("banned");
    expect(view.getByText("Blocked")).toBeTruthy();
    expect(view.getByText("Blocked by moderation. Buyers do not see it.")).toBeTruthy();
    expect(view.queryByRole("button")).toBeNull();
    await fireEvent.press(view.getByText("Toyota Camry, 2018"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("draws an active Listing's price in the normal text colour, at the same size and weight (#775 F)", async () => {
    const { view } = await renderCard("active");
    const className = String(view.getByText("100,000 TMT").props.className);
    expect(className).toContain("text-foreground");
    expect(className).not.toMatch(/text-primary(?!-)/);
    expect(className).toContain("text-subhead");
    expect(className).toContain("font-heading");
  });

  it.each(["sold", "archived"] as const)("keeps the muted price of a %s Listing (#775 F)", async (status) => {
    const { view } = await renderCard(status);
    expect(String(view.getByText("100,000 TMT").props.className)).toContain("text-muted-foreground");
  });
});
