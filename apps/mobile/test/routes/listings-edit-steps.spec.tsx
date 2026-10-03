import { describe, it, expect, vi, beforeEach } from "vitest";

import { fireEvent, renderMobile, routeParams } from "../render";
import EditListingScreen from "../../app/listings/[id]/edit";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const media = [{ id, kind: "image", key: "photo.jpg", variants: {
    thumbnail: "t.jpg", list: "l.jpg", detail: "d.jpg", fullscreen: "f.jpg",
  }, sortOrder: 0 }];
  return {
    id, save: vi.fn().mockResolvedValue(true), show: vi.fn(),
    retry: vi.fn().mockResolvedValue(true),
    deleteDraftDir: vi.fn().mockResolvedValue(undefined),
    saveState: { status: "idle", error: null, opStates: {} } as {
      status: string; error: Error | null; opStates: Record<string, string>;
    },
    baseline: { id, sellerId: id, publicNumber: 458, status: "active", brandId: id, modelId: id,
      year: 2020, condition: "used", mileageKm: 10000, priceAmount: 100000, priceCurrency: "TMT",
      displayPriceTmt: 100000, description: "Legacy listing", regionId: id, cityId: id,
      allowCalls: true, allowChat: true, acceptsExchange: false, installmentAvailable: false,
      media, viewCount: 0, favoriteCount: 0, publishedAt: "2026-09-30T00:00:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
      seller: { displayName: "Seller", memberSince: "2026-01-01T00:00:00.000Z" },
    },
    listing: {} as Record<string, unknown>,
    photos: [{ photoId: id, key: "photo.jpg", state: "uploaded", sortOrder: 0, retryCount: 0 }],
  };
});
fixture.listing = { ...fixture.baseline };
vi.mock("../../src/api/listings/useListingDetail", () => ({ useListingDetail: () => ({ data: fixture.listing }) }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: fixture.deleteDraftDir }));
vi.mock("../../src/listings/edit/useSaveListingEdit", () => ({
  useSaveListingEdit: () => ({
    save: fixture.save, retry: fixture.retry, isPending: false, ...fixture.saveState,
  }),
  opLabel: (id: string) => id,
}));
vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { Check: Icon, AlertCircle: Icon, Eye: Icon, ListChecks: Icon, X: Icon, ChevronLeft: Icon, RefreshCw: Icon, ChevronDown: Icon, ChevronRight: Icon, Lock: Icon };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: fixture.show }) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/api/catalog/useGenerations", () => ({ useGenerations: () => ({ data: { items: [] } }) }));
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

beforeEach(() => {
  routeParams.id = fixture.id;
  fixture.listing = {
    ...fixture.baseline,
    vin: "WBA1234567890ABCD",
    conditionDisclosure: { damaged: false },
  };
});

describe("editing a published Listing", () => {
  it("opens Check and publish as step 7 of 7 and shows Car, with its VIN, locked", () => {
    const screen = renderMobile(<EditListingScreen />);

    expect(screen.getByText(/Step 7 of 7/)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Check and publish, Step 7 of 7" })).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Edit Car" }));

    expect(screen.getByText(/Step 1 of 7/)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
    const vin = screen.getByLabelText("VIN");
    expect(vin.props.value).toBe("WBA1234567890ABCD");
    expect(vin.props.editable).toBe(false);
    expect(vin.props.accessibilityHint).toBe("This field cannot be changed after publishing.");
    expect(vin.props.accessibilityState).toEqual({ disabled: true });
  });
});
