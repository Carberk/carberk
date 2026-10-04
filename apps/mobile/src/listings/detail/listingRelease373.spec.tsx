import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollView, Text } from "react-native";
import * as Linking from "expo-linking";
import type { ListingsSchemas } from "@auto-tm/contracts";

import type * as ClientModule from "../../api/client";
import {
  renderMobile,
  fireEvent,
  act,
  routeParams,
  routerMock,
} from "../../../test/render";
import ListingDetailScreen from "../../../app/(public)/listings/[id]";
import { ListingDetailView } from "../components/ListingDetail";
import { ContactCtaBar } from "../components/ContactCtaBar";
import { PhotoGallery } from "../components/PhotoGallery";
import { fixture, maps } from "../../../test/fixtures/listing";

const state = vi.hoisted(() => ({
  data: undefined as ListingsSchemas.ListingDetail | undefined,
  error: null as unknown,
  isPending: false,
  viewer: null as { userId: string } | null,
  authenticated: true as boolean | null,
  config: {} as { reportEntryEnabled?: boolean },
  post: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("../../api/listings/useListingDetail", () => ({
  useListingDetail: () => state,
}));
vi.mock("../../auth/useViewer", () => ({ useViewer: () => state.viewer }));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: state.authenticated }),
}));
vi.mock("../../api/admin/useConfig", () => ({
  useConfig: () => ({ data: state.config }),
}));
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
vi.mock("../../admin/components/ReportSheet", () => ({
  ReportSheet: () => null,
}));
vi.mock("./useCatalogMaps", () => ({ useCatalogMaps: () => ({ maps }) }));

beforeEach(() => {
  state.data = fixture();
  state.error = null;
  state.isPending = false;
  state.viewer = null;
  state.authenticated = true;
  state.config = {};
  state.post.mockReset();
  state.refetch.mockClear();
  routeParams.id = state.data.id;
});

describe("issue 373 approved detail content", () => {
  it("shows the numeric photo counter even for one photo", () => {
    const screen = renderMobile(
      <PhotoGallery
        media={[
          {
            id: "photo",
            kind: "image",
            key: "photo.jpg",
            sortOrder: 0,
            variants: { thumbnail: "", list: "", detail: "", fullscreen: "" },
          },
        ]}
      />,
    );
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
  it("renders title, price, date/city, specs, description, condition, seller, report and footer in order", () => {
    const screen = renderMobile(
      <ListingDetailView
        listing={fixture({
          mileageKm: 12000,
          transmissionId: "transmission",
          engineTypeId: "engine",
          enginePower: 180,
          driveTypeId: "drive",
          condition: "used",
          bodyTypeId: "body",
          colorId: "color",
          vin: "VIN373",
        })}
        maps={maps}
        onReport={vi.fn()}
      />,
    );
    const text = screen
      .UNSAFE_getAllByType(Text)
      .map((node) => node.props.children)
      .flat(Infinity)
      .filter((value) => typeof value === "string");
    const expected = [
      "Toyota Camry XV70, 2020",
      "35,000 TMT",
      "20 Sep · Ashgabat",
      "Specifications",
      "Year",
      "Mileage",
      "Transmission",
      "Engine type",
      "Power",
      "Drive type",
      "Condition",
      "Body type",
      "Color",
      "VIN",
      "Description",
      fixture().description ?? "",
      "Condition, as stated by the seller",
      "Seller",
      "Merdan",
      "Report",
      "ID 373",
      "Published",
      "Updated",
    ];
    let last = -1;
    for (const value of expected) {
      const next = text.indexOf(value);
      expect(
        next,
        `${value} follows ${expected[expected.indexOf(value) - 1]}`,
      ).toBeGreaterThan(last);
      last = next;
    }
  });

  it("renders the stable public number and both dates in the footer", () => {
    const screen = renderMobile(
      <ListingDetailView listing={fixture()} maps={maps} />,
    );
    expect(screen.getByText("ID 373")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Updated")).toBeTruthy();
    expect(screen.getByText("20 Sep")).toBeTruthy();
    expect(screen.getByText("22 Sep")).toBeTruthy();
    expect(screen.queryByText(fixture().id)).toBeNull();
  });

  it("clamps the seller description and expands after More", () => {
    const screen = renderMobile(
      <ListingDetailView listing={fixture()} maps={maps} />,
    );
    expect(
      screen.getByText(fixture().description ?? "").props.numberOfLines,
    ).toBe(3);
    fireEvent.press(screen.getByRole("button", { name: "More" }));
    expect(
      screen.getByText(fixture().description ?? "").props.numberOfLines,
    ).toBeUndefined();
  });

  it("uses the real seller name and join month, with Private seller fallback and no phone badge", () => {
    const screen = renderMobile(
      <ListingDetailView listing={fixture()} maps={maps} />,
    );
    expect(screen.getByText("Merdan")).toBeTruthy();
    expect(screen.getByText(/On AutoTM since.*January 2024/)).toBeTruthy();
    expect(screen.queryByText("Phone verified")).toBeNull();
    screen.rerender(
      <ListingDetailView
        listing={fixture({
          seller: { displayName: null, memberSince: "2024-01-01T00:00:00Z" },
        })}
        maps={maps}
      />,
    );
    expect(screen.getByText("Private seller")).toBeTruthy();
  });

  it("omits missing specs, description and disclosure without placeholders", () => {
    const screen = renderMobile(
      <ListingDetailView
        listing={fixture({
          year: undefined,
          description: undefined,
          conditionDisclosure: undefined,
        })}
        maps={maps}
      />,
    );
    for (const label of [
      "Year",
      "Mileage",
      "Engine power",
      "VIN",
      "Description",
      "Condition, as stated by the seller",
      "Not provided",
      "Not decoded",
    ])
      expect(screen.queryByText(label)).toBeNull();
  });

  it.each([undefined, { decoded: false }] as const)(
    "hides unavailable VIN decoding",
    (vinHistory) => {
      const screen = renderMobile(
        <ListingDetailView
          listing={fixture({ vin: "VIN373", vinHistory })}
          maps={maps}
        />,
      );
      expect(screen.getByText("VIN373")).toBeTruthy();
      for (const label of [/VIN history/i, /not decoded/i])
        expect(screen.queryByText(label)).toBeNull();
    },
  );

  it("does not render the inspection demand entry", () => {
    const screen = renderMobile(
      <ListingDetailView listing={fixture()} maps={maps} />,
    );
    expect(
      screen.queryByRole("button", { name: /Request AutoTM inspection/i }),
    ).toBeNull();
  });

  it("does not render the extra trust link", () => {
    const screen = renderMobile(
      <ListingDetailView listing={fixture()} maps={maps} />,
    );
    expect(
      screen.queryByRole("button", { name: "How AutoTM keeps you safe" }),
    ).toBeNull();
  });

  it("keeps the decoded VIN case usable", () => {
    const screen = renderMobile(
      <ListingDetailView
        listing={fixture({
          vin: "VIN373",
          vinHistory: {
            decoded: true,
            brand: "Decoded Toyota",
            model: "Decoded Camry",
            year: 2020,
            confidence: 0.92,
          },
        })}
        maps={maps}
      />,
    );
    expect(screen.getByText("VIN history")).toBeTruthy();
    expect(screen.getByText("Decoded Toyota")).toBeTruthy();
    expect(screen.getByText(/92%/)).toBeTruthy();
  });

  it("shows views and saves only to the owner and moves lifecycle actions out of detail content", () => {
    const screen = renderMobile(
      <ListingDetailView listing={fixture()} maps={maps} />,
    );
    expect(screen.queryByText(/19 views/)).toBeNull();
    screen.rerender(
      <ListingDetailView listing={fixture()} maps={maps} isOwner />,
    );
    expect(screen.getByText("19 views")).toBeTruthy();
    expect(screen.getByText("4 saves")).toBeTruthy();
    expect(screen.getByText("10,000 USD")).toBeTruthy();
    for (const name of ["Edit", "Mark as sold", "Remove from sale", "Delete"])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });
});

describe("issue 373 screen controls", () => {
  it("does not open the deferred inspection prompt after publishing", () => {
    state.viewer = { userId: fixture().sellerId };
    routeParams.inspectionInterest = "1";
    const screen = renderMobile(<ListingDetailScreen />);
    expect(
      screen.queryByText(
        "An AutoTM mechanic inspection is coming soon. Register your interest to join the pilot.",
      ),
    ).toBeNull();
  });

  it("keeps Back, Favorite and More options visible without Share, then reveals the price/title after the photos scroll away", () => {
    const screen = renderMobile(<ListingDetailScreen />);
    for (const name of ["Back", "Favorite", "More options"])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByText("Toyota Camry, 2020")).toBeNull();
    fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
      nativeEvent: { contentOffset: { y: 500, x: 0 } },
    });
    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(screen.getAllByText("35,000 TMT")).toHaveLength(2);
  });

  it("offers no Share or Copy link anywhere, only Report in overflow (#495, #322)", () => {
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    const reportBefore = screen.getAllByRole("button", {
      name: "Report",
    }).length;
    fireEvent.press(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Report" }).length,
    ).toBeGreaterThan(reportBefore);
  });

  it.each(["sold", "archived"] as const)(
    "hides the buyer More options trigger on %s Listings, where the overflow would be empty (#495)",
    (status) => {
      state.data = fixture({ status });
      const screen = renderMobile(<ListingDetailScreen />);
      expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    },
  );

  it("hides the buyer More options trigger when report entry is disabled (#495)", () => {
    state.config = { reportEntryEnabled: false };
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });

  it("keeps the owner More options menu on an archived Listing (#495)", () => {
    state.data = fixture({ status: "archived" });
    state.viewer = { userId: fixture().sellerId };
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.getByRole("button", { name: "More options" })).toBeTruthy();
  });

  it("shows sticky owner Edit and Mark sold, with Remove from sale and Delete in overflow", () => {
    state.viewer = { userId: fixture().sellerId };
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark as sold" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove from sale" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "More options" }));
    expect(
      screen.getByRole("button", { name: "Remove from sale" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it.each(["Mark as sold", "Remove from sale"] as const)(
    "disables every lifecycle control in the bar and overflow while %s is in flight",
    async (started) => {
      state.viewer = { userId: fixture().sellerId };
      let finish: (value: unknown) => void = () => {};
      state.post.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const screen = renderMobile(<ListingDetailScreen />);
      fireEvent.press(screen.getByRole("button", { name: "More options" }));
      fireEvent.press(screen.getByRole("button", { name: started }));
      await act(async () => {
        fireEvent.press(screen.getByText("Confirm"));
      });
      expect(state.post).toHaveBeenCalledTimes(1);
      // React Query publishes pending state on a timer, so wait for it.
      await screen.findByRole("button", { name: started, disabled: true });
      for (const name of [
        "Edit",
        "Mark as sold",
        "Remove from sale",
        "Delete",
      ])
        expect(
          screen.getByRole("button", { name, disabled: true }),
        ).toBeTruthy();
      await act(async () => finish({}));
    },
  );

  it.each(["sold", "archived"] as const)(
    "hides contact, Favorite and Report for a %s buyer",
    (status) => {
      state.data = fixture({ status });
      const screen = renderMobile(<ListingDetailScreen />);
      for (const name of ["Call", "Message", "Favorite", "Report"])
        expect(screen.queryByRole("button", { name })).toBeNull();
      expect(
        screen.getByText(status === "sold" ? "Sold" : "Removed from sale"),
      ).toBeTruthy();
      fireEvent.press(
        screen.getByRole("button", { name: "See other Toyota Camry" }),
      );
      expect(routerMock.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { brandId: "brand", modelId: "model" },
        }),
      );
    },
  );

  it("gives 404 Home and Back recovery", () => {
    state.error = { status: 404 };
    const screen = renderMobile(<ListingDetailScreen />);
    expect(
      screen.getByText("This listing is no longer available"),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));
    expect(routerMock.navigate).toHaveBeenCalledWith("/(tabs)/(search)");
    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalled();
  });

  it("keeps only Call and Message in the contact bar and the SMS verification caption by Call", async () => {
    state.authenticated = false;
    const screen = renderMobile(
      <ContactCtaBar
        listingId={fixture().id}
        status="active"
        allowCalls
        allowChat
        contactPhone="+99361000000"
      />,
    );
    expect(
      screen
        .getAllByRole("button")
        .map(
          (button) => button.props.accessibilityLabel ?? button.props.children,
        ),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Favorite" })).toBeNull();
    expect(
      screen.getByText("AutoTM verifies sellers' numbers by SMS."),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Call" }));
    });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000000");
    fireEvent.press(screen.getByRole("button", { name: "Message" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(auth)/phone" }),
    );
  });

  it.each(["Favorite", "Report"])(
    "parks anonymous %s through requireSignIn",
    (action) => {
      state.authenticated = false;
      const screen = renderMobile(<ListingDetailScreen />);
      fireEvent.press(screen.getByRole("button", { name: action }));
      expect(routerMock.push).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: "/(auth)/phone" }),
      );
    },
  );
});
