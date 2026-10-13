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
