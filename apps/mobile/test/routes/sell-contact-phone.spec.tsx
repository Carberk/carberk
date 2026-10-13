import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingsSchemas } from "@auto-tm/contracts";

import { ApiError } from "../../src/api/client";
import SellScreen from "../../app/(tabs)/sell";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PHONE = "+99369999999";
const CONFIRMED_PHONE = "+99361111111";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const car = { brandId: id, modelId: id, year: 2020 };
  const details = {
    condition: "used",
    mileageKm: 10000,
    conditionDisclosure: { damaged: false },
  };
  const photos = { photos: [0, 1, 2].map((index) => ({ photoId: index === 0 ? id : `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, key: index === 0 ? "photo.jpg" : `support-${index}.jpg`, sortOrder: index })) };
  const price = { priceAmount: 100000, priceCurrency: "TMT" };
  const place = { description: "One owner", regionId: id, cityId: id };
  const contact = { allowCalls: true, allowChat: true };
  return {
    id,
    payloads: {
      atContact: { ...car, ...details, ...photos, ...price, ...place },
      callsOff: {
        ...car, ...details, ...photos, ...price, ...place,
        allowCalls: false, allowChat: true,
      },
      stale: {
        ...car, ...details, ...photos, ...price, ...place, ...contact,
        contactPhone: "+99369999999",
      },
    } as Record<string, Record<string, unknown>>,
    payload: {} as Record<string, unknown>,
    auth: { isAuthenticated: true, phone: "+99365000000" as string | null },
    // undefined: the list is still loading, or its request failed.
    confirmedPhones: [] as ListingsSchemas.VerifiedContactPhone[] | undefined,
    mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null },
    publish: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null },
    toastShow: vi.fn(),
    flush: vi.fn(),
  };
});

function confirmedEntry(phone: string, daysLeft: number): ListingsSchemas.VerifiedContactPhone {
  return {
    phone,
    source: "confirmed",
    confirmedAt: new Date(Date.now() - (7 - daysLeft) * DAY_MS).toISOString(),
    reusableUntil: new Date(Date.now() + daysLeft * DAY_MS).toISOString(),
  };
}

vi.mock("@react-navigation/native", async () => ({
  NavigationContext: (await import("react")).createContext(undefined),
}));
vi.mock("../../src/api/listings/useMyDrafts", () => ({
  useMyDrafts: () => ({
    data: { items: [{ id: fixture.id, payload: fixture.payload }] },
    isPending: false,
  }),
}));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => fixture.publish }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/useMyContactPhones", () => ({
  useMyContactPhones: () => ({
    data: fixture.confirmedPhones ? { items: fixture.confirmedPhones } : undefined,
  }),
}));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: "user-1" }) }));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({
  useWizardAutosave: () => ({
    save: vi.fn(), forceSave: vi.fn().mockResolvedValue(undefined), retrySave: vi.fn(),
    // Publish saves the draft first (#588); the save succeeds here.
    flush: fixture.flush, discardPending: vi.fn(),
    saveStatus: "idle", saveError: null,
  }),
}));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: [0, 1, 2].map((index) => ({ photoId: index === 0 ? fixture.id : `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, key: index === 0 ? "photo.jpg" : `support-${index}.jpg`, sortOrder: index, state: "uploaded" })),
  publishGate: { canPublish: true, blockers: [] }, isReady: true,
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => fixture.auth }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ show: fixture.toastShow, setTopClearance: vi.fn() }),
}));
vi.mock("@/components/ui/switch", async () => ({ Switch: (await import("react-native")).View }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("expo-image", async () => ({ Image: (await import("react-native")).View }));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
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

function resume(payload: keyof typeof fixture.payloads) {
  fixture.payload = fixture.payloads[payload] ?? {};
  routeParams.resumeDraftId = fixture.id;
}

beforeEach(() => {
  fixture.payload = {};
  fixture.auth = { isAuthenticated: true, phone: "+99365000000" };
  fixture.confirmedPhones = [];
  fixture.publish.mutateAsync.mockReset();
  fixture.toastShow.mockClear();
  fixture.flush.mockReset().mockResolvedValue(true);
});

describe("Sell wizard Contact step", () => {
  it("preselects the sign-in phone and lists confirmed numbers with the days left", async () => {
    fixture.confirmedPhones = [confirmedEntry(CONFIRMED_PHONE, 3)];
    resume("atContact");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
    expect(screen.getByText("Contact phone")).toBeTruthy();

    expect(
      screen.getByLabelText("+99365000000", { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(screen.getByText("Your sign-in phone. No code needed.")).toBeTruthy();
    expect(
      screen.getByText("Confirmed. 3 days left without a new code."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Another number")).toBeTruthy();

    expect(screen.getByText("Phone calls")).toBeTruthy();
    expect(screen.getByText("In-app chat")).toBeTruthy();
  });

  it("opens the number screen from Another number", async () => {
    resume("atContact");
    const screen = await renderMobile(<SellScreen />);

    await fireEvent.press(screen.getByLabelText("Another number"));

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone",
      params: { returnPathname: "/(tabs)/sell" },
    });
  });

  it("selects the number the code flow confirmed and clears the route param", async () => {
    fixture.confirmedPhones = [confirmedEntry(CONFIRMED_PHONE, 7)];
    resume("atContact");
    routeParams.confirmedContactPhone = CONFIRMED_PHONE;
    const screen = await renderMobile(<SellScreen />);

    expect(
      screen.getByLabelText(CONFIRMED_PHONE, { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByLabelText("+99365000000", { exact: false }).props.accessibilityState,
    ).toMatchObject({ checked: false });
    expect(routerMock.setParams).toHaveBeenCalledWith({
      confirmedContactPhone: undefined,
    });
  });

  it("marks a stale saved number, blocks Continue and offers reconfirmation", async () => {
    resume("stale");
    const screen = await renderMobile(<SellScreen />);

    // Opened from Check and publish (#588), so the step ends with Done.
    await fireEvent.press(screen.getByRole("button", { name: /^Contact, .*Change$/ }));

    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
    expect(
      screen.getByText("Confirmation expired. Tap to confirm again."),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(
      screen.getByText("Confirm this number again or choose another"),
    ).toBeTruthy();
    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(STALE_PHONE, { exact: false }));

    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone",
      params: {
        phone: STALE_PHONE,
        reconfirm: "1",
        returnPathname: "/(tabs)/sell",
      },
    });
  });

  it("does not call a saved number expired while the confirmed list is not known, and Done goes on", async () => {
    fixture.confirmedPhones = undefined;
    resume("stale");
    const screen = await renderMobile(<SellScreen />);

    await fireEvent.press(screen.getByRole("button", { name: /^Contact, .*Change$/ }));

    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
    expect(
      screen.queryByText("Confirmation expired. Tap to confirm again."),
    ).toBeNull();
    expect(
      screen.getByRole("radio", { name: STALE_PHONE }).props.accessibilityState,
    ).toMatchObject({ checked: true });

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Done" }));
    });

    // The app cannot judge the number yet, so it does not hold the seller
    // here; a publish the server refuses still comes back to Contact.
    expect(
      screen.queryByText("Confirm this number again or choose another"),
    ).toBeNull();
    expect(
      screen.getByRole("header", { name: "Check and publish, Step 7 of 7" }),
    ).toBeTruthy();
  });

  it("asks an email-only User to choose or confirm a contact phone", async () => {
    fixture.auth = { isAuthenticated: true, phone: null };
    resume("atContact");
    const screen = await renderMobile(<SellScreen />);

    expect(
      screen.getByText(
        "You signed in with email. Confirm a phone for this listing. It will not become a way to sign in.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("+99365000000")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Choose or confirm a contact phone"),
    ).toBeTruthy();
    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
  });

  it.each([
    ["CONTACT_PHONE_NOT_CONFIRMED", ListingsSchemas.ListingsErrorCode.ContactPhoneNotConfirmed],
    ["CONTACT_PHONE_REQUIRED", ListingsSchemas.ListingsErrorCode.ContactPhoneRequired],
  ] as const)(
    "a publish refused with %s keeps the draft and returns to the Contact step",
    async (_label, code) => {
      fixture.publish.mutateAsync.mockRejectedValue(new ApiError(code, 409));
      resume("stale");
      const screen = await renderMobile(<SellScreen />);

      await act(async () => {
        void fireEvent.press(screen.getByRole("button", { name: "Publish" }));
      });

      expect(
        screen.getByRole("header", { name: "Contact, Step 6 of 7" }),
      ).toBeTruthy();
      expect(
        screen.getByText("Confirm the contact phone again to publish."),
      ).toBeTruthy();
      expect(screen.getByLabelText(STALE_PHONE, { exact: false })).toBeTruthy();
      expect(fixture.toastShow).not.toHaveBeenCalled();
      // The draft was saved before the publish was tried, and stays open.
      expect(fixture.flush).toHaveBeenCalledOnce();

      // Picking a number that needs no code and Done returns to Check, where
      // Publish is ready again and no publish failure is worded (#588).
      await fireEvent.press(screen.getByLabelText("+99365000000", { exact: false }));
      expect(
        screen.queryByText("Confirm the contact phone again to publish."),
      ).toBeNull();
      await act(async () => {
        void fireEvent.press(screen.getByRole("button", { name: "Done" }));
      });
      expect(
        screen.getByRole("button", { name: "Publish" }).props.accessibilityState,
      ).toMatchObject({ disabled: false });
      expect(
        screen.queryByText("Could not publish. Your draft is saved. Try again."),
      ).toBeNull();
    },
  );

  it("holds Done on a number the server refused while the confirmed list is not known", async () => {
    fixture.confirmedPhones = undefined;
    fixture.publish.mutateAsync.mockRejectedValue(
      new ApiError(ListingsSchemas.ListingsErrorCode.ContactPhoneNotConfirmed, 409),
    );
    resume("stale");
    const screen = await renderMobile(<SellScreen />);

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Publish" }));
    });

    // The refusal settles what the app could not judge: the row is expired.
    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: `${STALE_PHONE}, Confirmation expired. Tap to confirm again.`,
      }),
    ).toBeTruthy();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Done" }));
    });

    expect(
      screen.getByText("Confirm this number again or choose another"),
    ).toBeTruthy();
    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
  });

  it("still requires a contact phone when calls are off, and shows no calls-off line (D7)", async () => {
    fixture.auth = { isAuthenticated: true, phone: null };
    resume("callsOff");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByText("Contact phone")).toBeTruthy();
    expect(screen.queryByText(/calls are off/i)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Choose or confirm a contact phone")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Contact, Step 6 of 7" })).toBeTruthy();
  });

  it("Continue is enabled with the preselected sign-in phone and moves to Check and publish", async () => {
    resume("atContact");
    const screen = await renderMobile(<SellScreen />);

    const next = screen.getByRole("button", { name: "Continue" });
    expect(next.props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => { void fireEvent.press(next); });

    expect(screen.queryByText("Choose or confirm a contact phone")).toBeNull();
    expect(
      screen.getByRole("header", { name: "Check and publish, Step 7 of 7" }),
    ).toBeTruthy();
  });

  it("Continue is enabled with a confirmed number selected and moves to Check and publish", async () => {
    fixture.confirmedPhones = [confirmedEntry(CONFIRMED_PHONE, 3)];
    resume("atContact");
    const screen = await renderMobile(<SellScreen />);

    await fireEvent.press(screen.getByLabelText(CONFIRMED_PHONE, { exact: false }));
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next.props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => { void fireEvent.press(next); });

    expect(
      screen.getByRole("header", { name: "Check and publish, Step 7 of 7" }),
    ).toBeTruthy();
  });
});
