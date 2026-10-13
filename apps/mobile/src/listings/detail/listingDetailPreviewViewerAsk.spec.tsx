import { beforeEach, describe, expect, it, vi } from "vitest";
import { Modal, Text } from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";

import type * as ClientModule from "../../api/client";
import { useAuthIntentStore } from "../../auth/intentStore";
import { fireEvent, renderMobile, routeParams, routerMock, within, first, getHost, getAllHosts } from "../../../test/render";
import ListingDetailScreen from "../../../app/(public)/listings/[id]";
import {
  fixture,
  maps,
  mediaFixture,
  summaryFixture,
} from "../../../test/fixtures/listing";

const state = vi.hoisted(() => ({
  data: undefined as ListingsSchemas.ListingDetail | undefined,
  preview: undefined as ListingsSchemas.ListingSummary | undefined,
  error: null as unknown,
  isPending: false,
  viewer: null as { userId: string } | null,
  authenticated: true as boolean | null,
  post: vi.fn(),
}));
vi.mock("../../api/listings/useListingDetail", () => ({
  useListingDetail: () => ({
    data: state.data,
    error: state.error,
    isPending: state.isPending,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../api/listings/useListingPreview", () => ({
  useListingPreview: () => state.preview,
}));
vi.mock("../../auth/useViewer", () => ({ useViewer: () => state.viewer }));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: state.authenticated }),
}));
vi.mock("../../api/admin/useConfig", () => ({ useConfig: () => ({ data: {} }) }));
vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { post: state.post, get: vi.fn(), delete: vi.fn() },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => {}),
}));
vi.mock("@/components/ui/skeleton", async () => ({
  Skeleton: (await import("react-native")).View,
}));
vi.mock("../../admin/components/ReportSheet", () => ({ ReportSheet: () => null }));
vi.mock("./useCatalogMaps", () => ({ useCatalogMaps: () => ({ maps }) }));
vi.mock("../feed/useFeedCatalogMaps", () => ({
  useFeedCatalogMaps: () => ({
    brandName: () => "Toyota",
    modelName: () => "Camry",
    cityName: () => "Ashgabat",
    namesPending: false,
  }),
}));
vi.mock("../../api/catalog/useTransmissions", () => ({
  useTransmissions: () => ({ data: { items: [{ id: "transmission", name: "Automatic" }] } }),
}));
vi.mock("../../api/catalog/useEngineTypes", () => ({
  useEngineTypes: () => ({ data: { items: [{ id: "engine", name: "Petrol" }] } }),
}));

const SELLER = fixture().sellerId;

beforeEach(() => {
  state.data = fixture({ media: mediaFixture(3) });
  state.preview = undefined;
  state.error = null;
  state.isPending = false;
  state.viewer = null;
  state.authenticated = true;
  state.post.mockReset();
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
  routeParams.id = fixture().id;
});

function texts(screen: Awaited<ReturnType<typeof renderMobile>>) {
  return getAllHosts(screen.container, "Text")
    .map((node) => node.props.children)
    .flat(Infinity)
    .filter((value): value is string => typeof value === "string");
}

describe("instant loading from a tapped card", () => {
  beforeEach(() => {
    state.data = undefined;
    state.isPending = true;
    state.preview = summaryFixture();
  });

  it("shows the card's photo, title, price, spec line, city and date before the detail arrives", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(screen.getByText("35,000 TMT")).toBeTruthy();
    expect(screen.getByText("12,000 km · Automatic · Petrol")).toBeTruthy();
    expect(screen.getByText("20 Sep · Ashgabat")).toBeTruthy();
    expect(screen.getByTestId("detail-skeleton-body")).toBeTruthy();
  });

  it("keeps the contact bar disabled until the full detail loads, then enables it in place", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    expect(screen.getByRole("button", { name: "Call", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message", disabled: true })).toBeTruthy();

    state.isPending = false;
    state.data = fixture();
    await screen.rerender(<ListingDetailScreen />);

    expect(screen.queryByTestId("detail-skeleton-body")).toBeNull();
    expect(screen.getByText("Specifications")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Call", disabled: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message", disabled: false })).toBeTruthy();
  });

  it("offers the owner no disabled contact bar while their own card loads", async () => {
    state.viewer = { userId: SELLER };
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
  });

  it("shows a plain skeleton for a deep link, with no card to borrow from", async () => {
    state.preview = undefined;
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.getByTestId("detail-skeleton")).toBeTruthy();
    expect(screen.queryByText("35,000 TMT")).toBeNull();
    expect(screen.queryByText(/Toyota/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
  });

  it("still shows the 404 recovery when the Listing is gone", async () => {
    state.isPending = false;
    state.error = { status: 404 };
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.getByText("This listing is no longer available")).toBeTruthy();
    expect(screen.queryByText("35,000 TMT")).toBeNull();
  });
});

describe("photo viewer from Listing detail", () => {
  const viewer = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
    within(getHost(screen.container, "Modal"));
  const openViewer = (screen: Awaited<ReturnType<typeof renderMobile>>, photo = 2) =>
    fireEvent.press(first(screen.getAllByRole("button", { name: `Photo ${photo} of 3` })));

  it("opens at the tapped photo with the counter, thumbnails, ♡ and Call + Message", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);

    await openViewer(screen, 2);

    expect(viewer(screen).getByText("2 / 3")).toBeTruthy();
    expect(viewer(screen).getAllByRole("button", { name: /^Photo \d of 3$/ })).toHaveLength(3);
    expect(viewer(screen).getByRole("button", { name: "Favorite" })).toBeTruthy();
    expect(viewer(screen).getByRole("button", { name: "Call" })).toBeTruthy();
    expect(viewer(screen).getByRole("button", { name: "Message" })).toBeTruthy();
  });

  it("closes back to the gallery on the photo it was left on", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    await openViewer(screen, 1);

    await fireEvent.press(viewer(screen).getByRole("button", { name: "Photo 3 of 3" }));
    await fireEvent.press(viewer(screen).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("closes before sending a signed-out Message to sign-in, so sign-in is not hidden behind it", async () => {
    state.authenticated = false;
    const screen = await renderMobile(<ListingDetailScreen />);
    await openViewer(screen);

    await fireEvent.press(viewer(screen).getByRole("button", { name: "Message" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(routerMock.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(auth)/phone" }),
    );
    expect(useAuthIntentStore.getState().intent?.action).toEqual({
      kind: "message",
      listingId: fixture().id,
    });
  });

  it("closes before sending a signed-out ♡ to sign-in", async () => {
    state.authenticated = false;
    const screen = await renderMobile(<ListingDetailScreen />);
    await openViewer(screen);

    await fireEvent.press(viewer(screen).getByRole("button", { name: "Favorite" }));

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(useAuthIntentStore.getState().intent?.action).toEqual({
      kind: "favorite",
      listingId: fixture().id,
    });
  });

  it("hides ♡ and Call + Message for the owner", async () => {
    state.viewer = { userId: SELLER };
    const screen = await renderMobile(<ListingDetailScreen />);

    await openViewer(screen);

    expect(viewer(screen).getByText("2 / 3")).toBeTruthy();
    for (const name of ["Favorite", "Call", "Message"])
      expect(viewer(screen).queryByRole("button", { name })).toBeNull();
  });

  it.each(["sold", "archived"] as const)(
    "hides ♡ and Call + Message on a %s Listing",
    async (status) => {
      state.data = fixture({ media: mediaFixture(3), status });
      const screen = await renderMobile(<ListingDetailScreen />);

      await openViewer(screen);

      expect(viewer(screen).getByText("2 / 3")).toBeTruthy();
      for (const name of ["Favorite", "Call", "Message"])
        expect(viewer(screen).queryByRole("button", { name })).toBeNull();
    },
  );
});

describe("Ask the seller on Listing detail", () => {
  it("sits after the description and before the seller's condition statement", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    const all = texts(screen);
    const order = [
      "Description",
      fixture().description ?? "",
      "Ask the seller",
      "Condition, as stated by the seller",
    ].map((value) => all.indexOf(value));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("asks a question straight from the detail, signed in", async () => {
    state.post.mockResolvedValue({
      id: "conversation-1",
      buyerId: "b",
      sellerId: SELLER,
      listing: { id: fixture().id },
    });
    const screen = await renderMobile(<ListingDetailScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Can I see the car?" }));

    await vi.waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith({
        pathname: "/conversations/[id]",
        params: expect.objectContaining({ draft: "Can I see the car?" }),
      }),
    );
  });

  it("is hidden from the owner", async () => {
    state.viewer = { userId: SELLER };
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.queryByText("Ask the seller")).toBeNull();
  });

  it.each(["sold", "archived"] as const)("is hidden on a %s Listing", async (status) => {
    state.data = fixture({ status });
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.queryByText("Ask the seller")).toBeNull();
  });
});
