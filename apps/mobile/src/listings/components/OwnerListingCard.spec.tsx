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
function renderCard(status: ListingsSchemas.ListingSummary["status"]) {
  const onOpen = vi.fn();
  const onMore = vi.fn();
  const view = renderMobile(
    <OwnerListingCard listing={listing(status)} brandName="Toyota" modelName="Camry" cityName="Ashgabat" onOpen={onOpen} onMore={onMore} />,
  );
  return { view, onOpen, onMore };
}

describe("OwnerListingCard", () => {
  it("opens the Listing on tap and hands ⋯ its title", () => {
    const { view, onOpen, onMore } = renderCard("active");
    expect(view.getByText("Ashgabat")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "2018 Toyota Camry" }));
    expect(onOpen).toHaveBeenCalledWith("camry-1");
    fireEvent.press(view.getByRole("button", { name: "Actions for 2018 Toyota Camry" }));
    expect(onMore).toHaveBeenCalledWith(expect.objectContaining({ id: "camry-1" }), "2018 Toyota Camry");
  });

  it.each([
    ["sold", "Sold"],
    ["archived", "Removed from sale"],
  ] as const)("labels a %s Listing and keeps its actions", (status, label) => {
    const { view } = renderCard(status);
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByRole("button", { name: `2018 Toyota Camry, ${label}` })).toBeTruthy();
    expect(view.getByRole("button", { name: "Actions for 2018 Toyota Camry" })).toBeTruthy();
  });

  it("shows a blocked Listing with a neutral note, no ⋯ and no tap", () => {
    const { view, onOpen } = renderCard("banned");
    expect(view.getByText("Blocked")).toBeTruthy();
    expect(view.getByText("Blocked by moderation. Buyers do not see it.")).toBeTruthy();
    expect(view.queryByRole("button")).toBeNull();
    fireEvent.press(view.getByText("2018 Toyota Camry"));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
