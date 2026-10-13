import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingsSchemas } from "@auto-tm/contracts";

import { ApiError } from "../../src/api/client";
import { EditSessionError } from "../../src/listings/edit/useSaveListingEdit";
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
      status: string; error: Error | null; opStates: Record<string, string>;
    },
    auth: { isAuthenticated: true, phone: "+99365000000" as string | null },
    // undefined: the list is still loading, or its request failed.
    confirmedPhones: [] as ListingsSchemas.VerifiedContactPhone[] | undefined,
    listing: {
      id, sellerId: id, publicNumber: 458, status: "active", brandId: id, modelId: id,
      year: 2020, condition: "used", mileageKm: 10000, priceAmount: 100000, priceCurrency: "TMT",
      displayPriceTmt: 100000, description: "Listed car", regionId: id, cityId: id,
      contactPhone: "+99361234567", allowCalls: true, allowChat: true,
      acceptsExchange: false, installmentAvailable: false,
      conditionDisclosure: { damaged: false },
      media, viewCount: 0, favoriteCount: 0, publishedAt: "2026-09-30T00:00:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
      seller: { displayName: "Seller", nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2026-01-01T00:00:00.000Z" },
    } as Record<string, unknown>,
    photos: [0, 1, 2].map((index) => ({ photoId: index === 0 ? id : `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, key: index === 0 ? "photo.jpg" : `support-${index}.jpg`, state: "uploaded", sortOrder: index, retryCount: 0 })),
  };
});

vi.mock("../../src/api/listings/useListingDetail", () => ({ useListingDetail: () => ({ data: fixture.listing }) }));
vi.mock("../../src/api/listings/useMyContactPhones", () => ({
  useMyContactPhones: () => ({
    data: fixture.confirmedPhones ? { items: fixture.confirmedPhones } : undefined,
  }),
}));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: "user-1" }) }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => fixture.auth }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/listings/edit/useSaveListingEdit", async (importOriginal) => ({
  // The real error class and helpers; only the hook is replaced.
  ...(await importOriginal<object>()),
  useSaveListingEdit: () => ({
    save: fixture.save, retry: fixture.retry, isPending: false, ...fixture.saveState,
  }),
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

async function openContactStep(screen: Awaited<ReturnType<typeof renderMobile>>) {
  await fireEvent.press(screen.getByRole("button", { name: /^Contact, / }));
  expect(screen.getByRole("header", { name: "Contact" })).toBeTruthy();
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
  it("shows the Listing's current number selected without a code, and Done needs none", async () => {
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    expect(
      screen.getByLabelText("+99361234567", { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(screen.getByText("Current number of this listing")).toBeTruthy();
    expect(screen.getByText("Your sign-in phone. No code needed.")).toBeTruthy();
    expect(screen.getByLabelText("Another number")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("opens the number screen from Another number, returning to this edit", async () => {
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    await fireEvent.press(screen.getByLabelText("Another number"));

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone",
      params: { returnPathname: `/listings/${fixture.id}/edit` },
    });
  });

  it("selects the number the code flow confirmed and clears the route param", async () => {
    fixture.confirmedPhones = [confirmedEntry(CONFIRMED_PHONE, 7)];
    routeParams.confirmedContactPhone = CONFIRMED_PHONE;
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    expect(
      screen.getByLabelText(CONFIRMED_PHONE, { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByLabelText("+99361234567", { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: false });
    expect(routerMock.setParams).toHaveBeenCalledWith({
      confirmedContactPhone: undefined,
    });
  });

  it("selects the sign-in phone without a code", async () => {
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    await fireEvent.press(screen.getByLabelText("+99365000000", { exact: false }));

    expect(
      screen.getByLabelText("+99365000000", { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("does not leave the Contact step with a new number that is not confirmed", async () => {
    // The number came back from the code flow but is not in the confirmed list.
    routeParams.confirmedContactPhone = CONFIRMED_PHONE;
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    expect(screen.getByText("Confirmation expired. Tap to confirm again.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("header", { name: "Contact" })).toBeTruthy();
    expect(screen.getByText("Confirm this number again or choose another")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();

    await fireEvent.press(screen.getByLabelText(CONFIRMED_PHONE, { exact: false }));
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone",
      params: {
        phone: CONFIRMED_PHONE,
        reconfirm: "1",
        returnPathname: `/listings/${fixture.id}/edit`,
      },
    });
  });

  it("Back with a new number that is not confirmed asks for Contact on the list and keeps Save disabled", async () => {
    // The number came back from the code flow but is not in the confirmed list.
    routeParams.confirmedContactPhone = CONFIRMED_PHONE;
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: /^Contact, .*Fill in$/ })).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => { void fireEvent.press(save); });
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it("does not call a new number expired while the confirmed list is not known, and Done goes on", async () => {
    fixture.confirmedPhones = undefined;
    routeParams.confirmedContactPhone = CONFIRMED_PHONE;
    const screen = await renderMobile(<EditListingScreen />);
    await openContactStep(screen);

    expect(
      screen.queryByText("Confirmation expired. Tap to confirm again."),
    ).toBeNull();
    expect(
      screen.getByRole("radio", { name: CONFIRMED_PHONE }).props.accessibilityState,
    ).toMatchObject({ checked: true });

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(
      screen.queryByText("Confirm this number again or choose another"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("a save refused with CONTACT_PHONE_NOT_CONFIRMED returns to the Contact step", async () => {
    fixture.save.mockRejectedValue(
      new EditSessionError(
        { fields: "failed" },
        "fields",
        new ApiError(ListingsSchemas.ListingsErrorCode.ContactPhoneNotConfirmed, 400),
      ),
    );
    const screen = await renderMobile(<EditListingScreen />);
    // The seller changes the number: Save changes sends nothing for an unchanged Listing (#589).
    await openContactStep(screen);
    await fireEvent.press(screen.getByLabelText("+99365000000", { exact: false }));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    expect(screen.getByRole("header", { name: "Contact" })).toBeTruthy();
    expect(screen.getByText("Confirm this number again or choose another")).toBeTruthy();
    expect(fixture.show).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("any other failed save stays on the section list", async () => {
    fixture.save.mockRejectedValue(
      new EditSessionError({ fields: "failed" }, "fields", new ApiError("INTERNAL", 500)),
    );
    const screen = await renderMobile(<EditListingScreen />);
    // The seller changes the number: Save changes sends nothing for an unchanged Listing (#589).
    await openContactStep(screen);
    await fireEvent.press(screen.getByLabelText("+99365000000", { exact: false }));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    expect(fixture.save).toHaveBeenCalledOnce();
    expect(screen.queryByRole("header", { name: "Contact" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });
});
