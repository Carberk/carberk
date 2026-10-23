import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ListingDetailScreen from "../../app/(public)/listings/[id]";
import { useListings } from "../../src/api/listings/useListings";
import { clearAuthSession } from "../../src/auth/session";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { ListingCard } from "../../src/listings/feed/ListingCard";
import { useFeedCatalogMaps } from "../../src/listings/feed/useFeedCatalogMaps";
import { cardPayload, detailPayload, listingDetailServer } from "../fixtures/listingDetailServer";
import { act, fireEvent, queryAllHosts, renderMobile, routeParams, routerMock, within } from "../render";

// This driver replaces navigation only: the real card loads through the real
// feed hook, leaving its parsed response in the same cache as the real route.
function CardToDetail() {
  const feed = useListings();
  const listings = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const names = useFeedCatalogMaps(listings);
  const [opened, setOpened] = useState(false);
  if (opened) return <ListingDetailScreen />;
  return listings.map((listing) => <ListingCard key={listing.id} listing={listing}
    brandName={names.brandName(listing.brandId)} modelName={names.modelName(listing.modelId)}
    cityName={names.cityName(listing.cityId)} onPress={(id) => { routeParams.id = id; setOpened(true); }} />);
}

type Screen = Awaited<ReturnType<typeof renderMobile>>;
let releaseDetail: (() => void) | undefined;
beforeEach(async () => {
  await clearAuthSession();
  useAuthIntentStore.getState().cancelSignIn();
});
afterEach(() => { releaseDetail?.(); releaseDetail = undefined; });

async function openCard(card = cardPayload(), detail = detailPayload()) {
  ({ releaseDetail } = listingDetailServer(card, detail));
  const screen = await renderMobile(<CardToDetail />);
  await fireEvent.press(await screen.findByText("2020 Toyota Camry"));
  await screen.findByText("Toyota Camry, 2020");
  for (const text of ["Automatic", "Petrol", "20 Sep · Ashgabat"]) await screen.findByText(text);
  return screen;
}

async function loadDetail(screen: Screen) {
  await act(async () => { releaseDetail?.(); });
  await screen.findByText("One owner. Regular service. Ready for viewing.");
  // Catalog requests can finish after the detail itself.
  await screen.findByText("Toyota Camry XV70, 2020");
}

function entries(screen: Screen) {
  return screen.container.queryAll((node) => typeof node.type === "string"
    && /^spec-(cell|row)/.test(node.props.testID ?? ""))
    .map((node) => ({
      kind: node.props.testID.replace(/-loading$/, ""),
      layout: node.props.className,
      text: node.props.testID.endsWith("-loading") ? "loading"
        : queryAllHosts(node, "Text").flatMap((text) => [text.props.children].flat()).join(" "),
    }));
}

function chrome(screen: Screen) {
  return {
    badges: ["Exchange possible", "Installment possible"].filter((text) => screen.queryByText(text)),
    buttons: ["Call", "Message"].flatMap((name) => screen.queryAllByRole("button", { name })
      .map((button) => ({
        name,
        layout: String(button.props.className).split(" ")
          .filter((token) => /^(flex-1$|min-h-|px-|py-|rounded-)/.test(token)),
        container: button.parent?.props.className,
      }))),
  };
}

describe("Listing detail from a card fetched through MSW", () => {
  it("keeps complete Specifications, VIN space, badges and contact layout as delayed detail arrives", async () => {
    const screen = await openCard();
    for (const text of ["Front wheel", "Sedan", "White"]) await screen.findByText(text);
    const preview = entries(screen);
    expect(preview.map((entry) => entry.text)).toEqual([
      "Year 2020", "Mileage 12,000 km", "Transmission Automatic", "Engine type Petrol",
      "Power 150 hp", "Drive type Front wheel", "Condition Used", "Body type Sedan", "Color White", "loading",
    ]);
    expect(screen.getAllByTestId("spec-row-loading")).toHaveLength(1);
    expect(screen.queryByText("JTDKB20U793456789")).toBeNull();
    const before = chrome(screen);
    expect(before.badges).toEqual(["Exchange possible", "Installment possible"]);
    expect(before.buttons.map((button) => button.name)).toEqual(["Call", "Message"]);
    for (const name of ["Call", "Message"]) expect(screen.getByRole("button", { name })).toBeDisabled();

    await loadDetail(screen);

    expect(entries(screen).map(({ kind, layout }) => ({ kind, layout })))
      .toEqual(preview.map(({ kind, layout }) => ({ kind, layout })));
    expect(entries(screen).map((entry) => entry.text)).toEqual([
      "Year 2020", "Mileage 12,000 km", "Transmission Automatic", "Engine type Petrol",
      "Power 150 hp", "Drive type Front wheel", "Condition Used", "Body type Sedan", "Color White", "VIN JTDKB20U793456789",
    ]);
    expect(chrome(screen)).toEqual(before);
    for (const name of ["Call", "Message"]) expect(screen.getByRole("button", { name })).toBeEnabled();
    // Real auth hooks finish signed out; the loaded action preserves its intent.
    await fireEvent.press(screen.getByRole("button", { name: "Message" }));
    expect(useAuthIntentStore.getState().intent?.action).toEqual({ kind: "message", listingId: "00000000-0000-4000-8000-000000000373" });
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(auth)/phone" }));
  });

  it.each([
    ["a seller declining calls", false, true],
    ["a seller with no contact phone", true, false],
  ] as const)("keeps sparse Specifications and the single Message slot for %s", async (_name, allowCalls, hasContactPhone) => {
    const optional = { enginePower: undefined, driveTypeId: undefined, bodyTypeId: undefined, colorId: undefined };
    const screen = await openCard(
      cardPayload({ ...optional, hasVin: false, acceptsExchange: false, allowCalls, hasContactPhone }),
      detailPayload({ ...optional, vin: undefined, acceptsExchange: false, allowCalls, contactPhone: hasContactPhone ? "+99361000000" : undefined }),
    );
    const preview = entries(screen);
    expect(preview.map((entry) => entry.text)).toEqual([
      "Year 2020", "Mileage 12,000 km", "Transmission Automatic", "Engine type Petrol", "Condition Used",
    ]);
    expect(screen.queryByTestId("spec-row-loading")).toBeNull();
    const before = chrome(screen);
    expect(before.badges).toEqual(["Installment possible"]);
    expect(before.buttons.map((button) => button.name)).toEqual(["Message"]);
    expect(screen.getByRole("button", { name: "Message" })).toBeDisabled();

    await loadDetail(screen);

    expect(entries(screen)).toEqual(preview);
    expect(chrome(screen)).toEqual(before);
    expect(screen.getByRole("button", { name: "Message" })).toBeEnabled();
    expect(screen.queryByText("VIN")).toBeNull();
  });

  it("accepts older feed payloads without additive summary fields and fills placeholders from detail", async () => {
    const card = cardPayload({
      enginePower: undefined, driveTypeId: undefined, bodyTypeId: undefined, colorId: undefined, hasVin: undefined,
      acceptsExchange: undefined, installmentAvailable: undefined, allowCalls: undefined, allowChat: undefined, hasContactPhone: undefined,
    });
    const screen = await openCard(card);
    expect(screen.getAllByTestId("spec-cell-loading")).toHaveLength(2);
    expect(screen.getAllByTestId("spec-row-loading")).toHaveLength(2);
    expect(chrome(screen).badges).toEqual([]);
    expect(screen.queryByText("JTDKB20U793456789")).toBeNull();
    expect(within(screen.getByTestId("detail-skeleton-body")).getByText("12,000 km")).toBeTruthy();

    await loadDetail(screen);

    expect(screen.queryByTestId("spec-cell-loading")).toBeNull();
    expect(screen.queryByTestId("spec-row-loading")).toBeNull();
    for (const text of ["150 hp", "Front wheel", "Sedan", "White", "JTDKB20U793456789"])
      expect(await screen.findByText(text)).toBeTruthy();
    expect(chrome(screen).badges).toEqual(["Exchange possible", "Installment possible"]);
  });
});
