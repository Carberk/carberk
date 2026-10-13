import { createElement } from "react";
import { expect, it } from "vitest";

import { renderMobile } from "../../../test/render";
import { fixture, maps } from "../../../test/fixtures/listing";

import { ListingDetailView } from "./ListingDetail";

it("does not render the deferred inspection entry or extra trust link", async () => {
  const screen = await renderMobile(
    createElement(ListingDetailView, { listing: fixture(), maps }),
  );
  expect(
    screen.queryByRole("button", {
      name: /inspection|How Carberk keeps you safe/i,
    }),
  ).toBeNull();
});
