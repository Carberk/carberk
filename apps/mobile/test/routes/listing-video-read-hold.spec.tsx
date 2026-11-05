import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { View } from "react-native";
import type { ReactElement } from "react";
import type * as NativeModule from "react-native";

import EditListingScreen from "../../app/listings/[id]/edit";
import { useListingDetail } from "../../src/api/listings/useListingDetail";
import { queryKeys } from "../../src/api/queryKeys";
import { ListingDetailView } from "../../src/listings/components/ListingDetail";
import { fixture, maps, mediaFixture } from "../fixtures/listing";
import { server } from "../msw";
import { renderMobile, routeParams } from "../render";

import { ToastProvider } from "@/components/ui/toast";

// Run the real queries, gallery, edit route and upload queue. Only native
// filesystem/image/connectivity services use substitutes; HTTP goes through MSW.
vi.mock("react-native", async importOriginal => ({
  ...await importOriginal<typeof NativeModule>(),
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => {} }) },
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  getInfoAsync: async () => ({ exists: false }),
  makeDirectoryAsync: async () => {},
  deleteAsync: async () => {},
  readDirectoryAsync: async () => [],
}));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
  ImageManipulator: { manipulate: vi.fn() },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) },
}));
vi.mock("@rn-primitives/switch", async () => {
  const { View } = await import("react-native");
  return { Root: View, Thumb: View };
});
vi.mock("@rn-primitives/progress", async () => {
  const { View } = await import("react-native");
  return { Root: View, Indicator: View };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const photos = mediaFixture(3);
const legacy = fixture({
  brandId: "00000000-0000-4000-8000-000000000001",
  modelId: "00000000-0000-4000-8000-000000000002",
  generationId: "00000000-0000-4000-8000-000000000003",
  regionId: "00000000-0000-4000-8000-000000000004",
  cityId: "00000000-0000-4000-8000-000000000005",
  media: [{
    id: "00000000-0000-4000-8000-000000000999",
    kind: "video", key: "legacy/original.mp4", sortOrder: 0,
    variants: {
      thumbnail: "https://media.test/legacy.mp4", list: "https://media.test/legacy.mp4",
      detail: "https://media.test/legacy.mp4", fullscreen: "https://media.test/legacy.mp4",
    },
  }, ...photos.map(photo => ({ ...photo, sortOrder: photo.sortOrder + 1 }))],
});

function Detail() {
  const { data } = useListingDetail(legacy.id);
  return data ? <ListingDetailView listing={data} maps={maps} isOwner /> : null;
}

beforeEach(() => {
  routeParams.id = legacy.id;
  server.use(
    http.get("*/listings/:id", () => HttpResponse.json(legacy)),
    http.get("*/catalog/*", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })),
    http.get("*/exchange-rates*", () => HttpResponse.json({ rates: [] })),
  );
});

describe.each(["network", "cached"] as const)("legacy video from %s detail", source => {
  async function open(element: ReactElement) {
    const screen = await renderMobile(<View />);
    if (source === "cached") {
      screen.queryClient.setQueryData(queryKeys.listings.detail(legacy.id), legacy);
    }
    await screen.rerender(element);
    return screen;
  }

  it("shows only the three photos in the real detail gallery", async () => {
    const screen = await open(<Detail />);
    expect(await screen.findByLabelText("Photo 1 of 3")).toBeTruthy();
    expect(screen.queryByLabelText("Photo 1 of 4")).toBeNull();
  });

  it("seeds only three photos into the real edit session", async () => {
    const screen = await open(<ToastProvider><EditListingScreen /></ToastProvider>);
    expect(await screen.findByText("Photos: 3")).toBeTruthy();
    expect(screen.queryByText("Photos: 4")).toBeNull();
  });
});
