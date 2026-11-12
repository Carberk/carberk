import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { renderMobile } from "../../../test/render";
import { fixture, maps } from "../../../test/fixtures/listing";

import { ListingDetailView } from "./ListingDetail";

describe("decoded VIN", () => {
  it.each([undefined, { decoded: false }] as const)(
    "hides unavailable decoding while retaining the VIN specification",
    async (vinHistory) => {
      const screen = await renderMobile(
        createElement(ListingDetailView, {
          listing: fixture({ vin: "VIN373", vinHistory }),
          maps,
        }),
      );
      expect(screen.getByText("VIN373")).toBeTruthy();
      expect(screen.queryByText("VIN history")).toBeNull();
    },
  );
  it("shows only actual decoded fields and confidence", async () => {
    const screen = await renderMobile(
      createElement(ListingDetailView, {
        listing: fixture({
          vinHistory: {
            decoded: true,
            brand: "Decoded brand",
            confidence: 0.92,
          },
        }),
        maps,
      }),
    );
    expect(screen.getByText("VIN history")).toBeTruthy();
    expect(screen.getByText("Decoded brand")).toBeTruthy();
    expect(screen.getByText(/92%/)).toBeTruthy();
    expect(screen.queryByText(/accident|theft|ownership history/i)).toBeNull();
  });
});

it("reads specifications, seller condition, description and seller before two draft suggestions", async () => {
  const screen = await renderMobile(createElement(ListingDetailView, {
    listing: fixture({ colorId: "white" }), maps,
  }));
  expect(screen.getAllByRole("header").map((node) => node.props.children)).toEqual([
    "Toyota Camry XV70, 2020", "Specifications", "Condition, as stated by the seller",
    "Description", "Seller", "Ask the seller",
  ]);
  expect(screen.getByText("White")).toBeTruthy();
  expect(screen.getByText("Small scratch")).toBeTruthy();
  expect(screen.getByText("Opens an unsent draft. Review it before sending.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Can I see the car?" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "What is the final price?" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Is the car still available?" })).toBeNull();
});
