import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react-native";

import { renderMobile, routeParams } from "../render";
import EditListingScreen from "../../app/listings/[id]/edit";

// Reopening the editor with the real upload queue over an in-memory staging
// directory: files an earlier edit session left behind must not come back.

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const variants = { thumbnail: "t.jpg", list: "l.jpg", detail: "d.jpg", fullscreen: "f.jpg" };
  return {
    id,
    /** Paths that exist in the fake document directory. */
    files: new Set<string>(),
    listing: {
      id, sellerId: id, publicNumber: 458, status: "active", brandId: id, modelId: id,
      year: 2020, condition: "used", mileageKm: 10000, priceAmount: 100000, priceCurrency: "TMT",
      displayPriceTmt: 100000, description: "Legacy listing", regionId: id, cityId: id,
      allowCalls: true, allowChat: true, acceptsExchange: false, installmentAvailable: false,
      conditionDisclosure: { damaged: false },
      media: [{ id, kind: "image", key: "photo.jpg", variants, sortOrder: 0 }],
      viewCount: 0, favoriteCount: 0, publishedAt: "2026-09-30T00:00:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
      seller: { displayName: "Seller", memberSince: "2026-01-01T00:00:00.000Z" },
    },
  };
});

vi.mock("expo-file-system/legacy", () => {
  const under = (dir: string) => [...fixture.files].filter((f) => f.startsWith(dir));
  return {
    documentDirectory: "file:///doc/",
    getInfoAsync: vi.fn(async (uri: string) => ({
      exists: fixture.files.has(uri) || under(uri.endsWith("/") ? uri : `${uri}/`).length > 0,
      uri,
    })),
    readDirectoryAsync: vi.fn(async (dir: string) =>
      under(dir).map((f) => f.slice(dir.length)).filter((name) => !name.includes("/")),
    ),
    deleteAsync: vi.fn(async (uri: string) => {
      fixture.files.delete(uri);
      under(uri).forEach((f) => fixture.files.delete(f));
    }),
    makeDirectoryAsync: vi.fn(async () => undefined),
    uploadAsync: vi.fn(),
    FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
  };
});
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: vi.fn() } }));
vi.mock("../../src/listings/uploadStaging/appStateResume", () => ({ setupUploadResume: () => () => undefined }));
vi.mock("../../src/api/listings/useListingDetail", () => ({ useListingDetail: () => ({ data: fixture.listing }) }));
vi.mock("../../src/listings/edit/useSaveListingEdit", () => ({
  useSaveListingEdit: () => ({
    save: vi.fn(), retry: vi.fn(), isPending: false, status: "idle", error: null, opStates: {},
  }),
  opLabel: (id: string) => id,
}));
vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { Check: Icon, AlertCircle: Icon, Eye: Icon, ListChecks: Icon, X: Icon, ChevronLeft: Icon, RefreshCw: Icon };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

const stagingDir = `file:///doc/listing-staging/edit-${fixture.id}/`;

beforeEach(() => {
  routeParams.id = fixture.id;
  fixture.files.clear();
});

describe("reopening the Listing editor", () => {
  it("does not restore a photo an earlier edit session left in staging", async () => {
    // A save that later left the screen by back gesture, or an app kill, kept this file.
    fixture.files.add(`${stagingDir}7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg`);

    const screen = renderMobile(<EditListingScreen />);
    await waitFor(() => expect([...fixture.files]).toEqual([]));

    expect(screen.queryByText(/uploading/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes", disabled: false })).toBeTruthy();
  });
});
