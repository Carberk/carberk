import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListingsSchemas } from "@auto-tm/contracts";

import { ApiError } from "../../src/api/client";
import EditListingScreen from "../../app/listings/[id]/edit";

import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIRMED_PHONE = "+99361111111";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const media = [{ id, kind: "image", key: "photo.jpg", variants: {
    thumbnail: "t.jpg", list: "l.jpg", detail: "d.jpg", fullscreen: "f.jpg",
  }, sortOrder: 0 }];
  return {
    id,
    save: vi.fn().mockResolvedValue(true),
    retry: vi.fn().mockResolvedValue(true),
    show: vi.fn(),
    saveState: { status: "idle", error: null, opStates: {} } as {
      status: string; error: (Error & { cause?: unknown }) | null; opStates: Record<string, string>;
    },
    auth: { isAuthenticated: true, phone: "+99365000000" as string | null },
    confirmedPhones: [] as ListingsSchemas.VerifiedContactPhone[],
    listing: {
      id, sellerId: id, publicNumber: 458, status: "active", brandId: id, modelId: id,
      year: 2020, condition: "used", mileageKm: 10000, priceAmount: 100000, priceCurrency: "TMT",
      displayPriceTmt: 100000, description: "Listed car", regionId: id, cityId: id,
      contactPhone: "+99361234567", allowCalls: true, allowChat: true,
      acceptsExchange: false, installmentAvailable: false,
      conditionDisclosure: { damaged: false },
      media, viewCount: 0, favoriteCount: 0, publishedAt: "2026-09-30T00:00:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
      seller: { displayName: "Seller", memberSince: "2026-01-01T00:00:00.000Z" },
    } as Record<string, unknown>,
    photos: [{ photoId: id, key: "photo.jpg", state: "uploaded", sortOrder: 0, retryCount: 0 }],
  };
});

vi.mock("../../src/api/listings/useListingDetail", () => ({ useListingDetail: () => ({ data: fixture.listing }) }));
vi.mock("../../src/api/listings/useMyContactPhones", () => ({
  useMyContactPhones: () => ({ data: { items: fixture.confirmedPhones } }),
}));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: "user-1" }) }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => fixture.auth }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/listings/edit/useSaveListingEdit", () => ({
  useSaveListingEdit: () => ({
    save: fixture.save, retry: fixture.retry, isPending: false, ...fixture.saveState,
  }),
  opLabel: (id: string) => id,
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: fixture.show }) }));
vi.mock("@/components/ui/switch", async () => ({ Switch: (await import("react-native")).View }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("expo-image", async () => ({ Image: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useGenerations", () => ({ useGenerations: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

function confirmedEntry(phone: string, daysLeft: number): ListingsSchemas.VerifiedContactPhone {
  return {
    phone,
    source: "confirmed",
    confirmedAt: new Date(Date.now() - (7 - daysLeft) * DAY_MS).toISOString(),
    reusableUntil: new Date(Date.now() + daysLeft * DAY_MS).toISOString(),
  };
}

function openContactStep(screen: ReturnType<typeof renderMobile>) {
  fireEvent.press(screen.getByRole("button", { name: "Edit Contact" }));
  expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
}

beforeEach(() => {
  routeParams.id = fixture.id;
  fixture.save.mockReset().mockResolvedValue(true);
  fixture.retry.mockReset().mockResolvedValue(true);
  fixture.show.mockClear();
  fixture.saveState = { status: "idle", error: null, opStates: {} };
  fixture.auth = { isAuthenticated: true, phone: "+99365000000" };
  fixture.confirmedPhones = [];
});

describe("Listing edit Contact step", () => {
  it("shows the Listing's current number selected without a code, and Done needs none", () => {
    const screen = renderMobile(<EditListingScreen />);
    openContactStep(screen);

    expect(
      screen.getByLabelText("+99361234567").props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByText("Current number of this Listing")).toBeTruthy();
    expect(screen.getByText("Your sign-in phone. No code needed.")).toBeTruthy();
    expect(screen.getByLabelText("Another number")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("opens the number screen from Another number, returning to this edit", () => {
    const screen = renderMobile(<EditListingScreen />);
    openContactStep(screen);

    fireEvent.press(screen.getByLabelText("Another number"));

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone",
      params: { returnPathname: `/listings/${fixture.id}/edit` },
    });
  });

  it("selects the number the code flow confirmed and clears the route param", () => {
    fixture.confirmedPhones = [confirmedEntry(CONFIRMED_PHONE, 7)];
    routeParams.confirmedContactPhone = CONFIRMED_PHONE;
    const screen = renderMobile(<EditListingScreen />);
    openContactStep(screen);

    expect(
      screen.getByLabelText(CONFIRMED_PHONE).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByLabelText("+99361234567").props.accessibilityState,
    ).toMatchObject({ selected: false });
    expect(routerMock.setParams).toHaveBeenCalledWith({
      confirmedContactPhone: undefined,
    });
  });

  it("a save refused with CONTACT_PHONE_NOT_CONFIRMED returns to the Contact step", async () => {
    fixture.save.mockImplementation(async () => {
      fixture.saveState = {
        status: "failed",
        error: Object.assign(new Error("Edit session failed at operation fields"), {
          cause: new ApiError(
            ListingsSchemas.ListingsErrorCode.ContactPhoneNotConfirmed,
            409,
          ),
        }),
        opStates: { fields: "failed" },
      };
      return false;
    });
    const screen = renderMobile(<EditListingScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });
    screen.rerender(<EditListingScreen />);

    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
    expect(
      screen.getByText("Confirm the contact phone again to publish."),
    ).toBeTruthy();
    expect(fixture.show).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
