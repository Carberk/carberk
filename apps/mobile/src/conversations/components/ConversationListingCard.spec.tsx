import { describe, expect, it } from "vitest";

import { fireEvent, renderMobile, routerMock } from "../../../test/render";

import { ConversationListingCard } from "./ConversationListingCard";

const listing = {
  id: "00000000-0000-4000-8000-0000000000a1",
  brandId: "00000000-0000-4000-8000-0000000000d1",
  modelId: "00000000-0000-4000-8000-0000000000d2",
  year: 2018,
  displayPriceTmt: 285000,
  priceCurrency: "USD" as const,
  coverMediaKey: "listings/a.jpg",
  status: "active" as const,
};

describe("ConversationListingCard", () => {
  it("shows a 56 pt thumbnail, year Brand Model and the price in TMT, and opens the Listing", () => {
    const screen = renderMobile(
      <ConversationListingCard listing={listing} brandName="Toyota" modelName="Camry" />,
    );

    expect(screen.getByText("2018 Toyota Camry")).toBeTruthy();
    expect(screen.getByText("285,000 TMT")).toBeTruthy();
    expect(screen.getByTestId("conversation-listing-thumbnail").props.className).toContain("h-14 w-14");
    expect(screen.getByTestId("conversation-listing-chevron")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Open: 2018 Toyota Camry, 285,000 TMT" }));
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${listing.id}`);
  });

  it("never shows raw catalog IDs while names load", () => {
    const screen = renderMobile(<ConversationListingCard listing={listing} />);

    expect(screen.getByText("2018")).toBeTruthy();
    expect(screen.queryByText(new RegExp(listing.brandId))).toBeNull();
  });

  it("dims the thumbnail, mutes the price and shows a Sold badge, still opening the Listing", () => {
    const screen = renderMobile(
      <ConversationListingCard listing={{ ...listing, status: "sold" }} brandName="Toyota" modelName="Camry" />,
    );

    expect(screen.getByText("Sold")).toBeTruthy();
    expect(screen.getByTestId("conversation-listing-thumbnail").props.className).toContain("opacity-60");
    expect(screen.getByText("285,000 TMT").props.className).toContain("text-muted-foreground");
    // The label replaces the children for screen readers, so it carries the badge.
    fireEvent.press(screen.getByRole("button", { name: "Open: 2018 Toyota Camry, 285,000 TMT, Sold" }));
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${listing.id}`);
  });

  it("shows the Removed from sale badge for an archived Listing", () => {
    const screen = renderMobile(
      <ConversationListingCard listing={{ ...listing, status: "archived" }} brandName="Toyota" modelName="Camry" />,
    );
    expect(screen.getByText("Removed from sale")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open: 2018 Toyota Camry, 285,000 TMT, Removed from sale" })).toBeTruthy();
    expect(screen.getByTestId("conversation-listing-thumbnail").props.className).toContain("opacity-60");
  });

  it("keeps an active Listing undimmed and without a badge", () => {
    const screen = renderMobile(<ConversationListingCard listing={listing} brandName="Toyota" modelName="Camry" />);
    expect(screen.queryByText("Sold")).toBeNull();
    expect(screen.getByTestId("conversation-listing-thumbnail").props.className).not.toContain("opacity-60");
  });

  it("is not tappable when the Listing is no longer available, though it is still shown", () => {
    const screen = renderMobile(
      <ConversationListingCard listing={listing} unavailable brandName="Toyota" modelName="Camry" />,
    );
    expect(screen.getByText("2018 Toyota Camry")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the unavailable label and is not tappable without a Listing", () => {
    const screen = renderMobile(<ConversationListingCard listing={null} />);

    expect(screen.getByText("Listing unavailable")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is localized when unavailable", () => {
    const screen = renderMobile(<ConversationListingCard listing={null} />, { locale: "tk" });
    expect(screen.getByText("Bildiriş elýeterli däl")).toBeTruthy();
  });

  it("shows a skeleton while loading", () => {
    const screen = renderMobile(<ConversationListingCard loading />);
    expect(screen.getByTestId("conversation-listing-skeleton")).toBeTruthy();
  });
});
