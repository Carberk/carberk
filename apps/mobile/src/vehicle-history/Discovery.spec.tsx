import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { HomeHeader } from "../listings/feed/HomeHeader";
import { ListingDetailView } from "../listings/components/ListingDetail";
import { fixture, maps } from "../../test/fixtures/listing";
import { fireEvent, renderMobile, routerMock } from "../../test/render";
import { server } from "../../test/msw";

beforeEach(() => {
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  server.use(http.get("*/listings/count", () => HttpResponse.json({ totalMatching: 4 })));
});

it("puts the outside-vehicle entry above Brand/model without replacing Search or feed actions", async () => {
  const screen = await renderMobile(<HomeHeader />);
  const labels = screen.getAllByRole("button").map((node) => node.props.accessibilityLabel);
  expect(labels).toEqual(["Search", "Vehicle History · 100 TMT", "Brand, model", undefined]);
  await fireEvent.press(screen.getByRole("button", { name: "Vehicle History · 100 TMT" }));
  expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/vehicle-history", params: {} });
  await fireEvent.press(screen.getByRole("button", { name: "Brand, model" }));
  expect(routerMock.push).toHaveBeenLastCalledWith("/(tabs)/(search)/brands");
});

it("opens public information from the real Listing component with only its Listing id", async () => {
  const screen = await renderMobile(<ListingDetailView listing={fixture({ allowChat: false })} maps={maps} />);
  await fireEvent.press(screen.getByRole("button", { name: "Vehicle History · 100 TMT" }));
  expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/vehicle-history", params: { listingId: "00000000-0000-4000-8000-000000000373" } });
  expect(screen.getByText("Toyota Camry XV70, 2020")).toBeTruthy();
});
