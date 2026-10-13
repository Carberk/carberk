import { AccessibilityInfo } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SellScreen from "../../app/(tabs)/sell";
import { ApiError } from "../../src/api/client";
import { act, fireEvent, renderMobile, routerMock, within } from "../render";

// The Sell route on Check and publish, with the real upload queue, wizard machine,
// autosave and Check screen. Only the device and the network are faked: the file
// system, presign and upload, the catalog, and the draft API.
const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const photoId = "11111111-1111-4111-8111-111111111111";
  const savedPhoto = { photoId, key: `${photoId}.jpg`, sortOrder: 0 };
  const savedPhotos = [savedPhoto, ...[1, 2].map((index) => ({
    ...savedPhoto, photoId: `${photoId.slice(0, -12)}${String(900 + index).padStart(12, "0")}`,
    key: `support-${photoId}-${index}.jpg`, sortOrder: index,
  }))];
  const complete = {
    brandId: id, modelId: id, year: 2020,
    condition: "used", mileageKm: 10000, conditionDisclosure: { damaged: false },
    photos: savedPhotos,
    priceAmount: 100000, priceCurrency: "TMT", description: "One owner", regionId: id, cityId: id,
    contactPhone: "+99365000000", allowCalls: true, allowChat: true,
  } as Record<string, unknown>;
  return {
    id,
    photoId,
    savedPhoto,
    savedPhotos,
    complete,
    payload: complete,
    // File names by staging directory, as the device would list them.
    staged: {} as Record<string, string[]>,
    // While set, reading the staging directory waits for it.
    stagingRead: null as Promise<void> | null,
    patch: vi.fn(),
    presign: vi.fn(),
    upload: vi.fn(),
    show: vi.fn(),
    mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null },
  };
});
vi.mock("@react-navigation/native", async () => ({
  NavigationContext: (await import("react")).createContext(undefined),
}));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn(), launchCameraAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1024 })),
  readDirectoryAsync: vi.fn(async (dir: string) => {
    if (fixture.stagingRead) await fixture.stagingRead;
    const key = dir.replace("file:///documents/listing-staging/", "").replace(/\/$/, "");
    return fixture.staged[key] ?? [];
  }),
  uploadAsync: fixture.upload,
  copyAsync: vi.fn(async () => {}), makeDirectoryAsync: vi.fn(async () => {}), deleteAsync: vi.fn(async () => {}),
}));
vi.mock("../../src/listings/uploadStaging/compressor", () => ({
  compressPhoto: vi.fn(), CompressionError: class CompressionError extends Error {},
}));
vi.mock("../../src/api/uploads/usePresignUpload", () => ({
  usePresignUpload: () => ({ mutateAsync: fixture.presign }),
}));
// The app-state and connectivity listeners are the OS's; nothing fires them here.
vi.mock("../../src/listings/uploadStaging/appStateResume", () => ({ setupUploadResume: () => () => {} }));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));
vi.mock("../../src/api/listings/useUpdateDraft", () => ({ useUpdateDraft: () => ({ mutateAsync: fixture.patch }) }));
vi.mock("../../src/api/listings/useMyDrafts", () => ({
  useMyDrafts: () => ({
    data: { items: [{ id: fixture.id, payload: fixture.payload, updatedAt: "2026-10-01T08:00:00.000Z" }] },
    isPending: false,
  }),
}));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => fixture.mutation }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, phone: "+99365000000" }) }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: fixture.show, setTopClearance: vi.fn() }) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step4Specs", () => ({ default: () => null }));
// Price, reduced to the one edit these tests make: clearing the amount.
vi.mock("../../src/listings/wizard/Step5Price", async () => {
  const { Pressable } = await import("react-native");
  return {
    default: ({ onChange }: { onChange: (updates: Record<string, unknown>) => void }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear price"
        onPress={() => onChange({ priceAmount: undefined })}
      />
    ),
  };
});
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
const named = (name: string) => ({ data: { items: [{ id: fixture.id, name }] } });
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => named("Toyota") }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => named("Camry") }));
vi.mock("../../src/api/catalog/useGenerations", () => ({ useGenerations: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useCityGroups", () => ({
  useCityGroups: () => ({ groups: [] }),
  findCityInGroups: () => ({ city: { name: "Ashgabat" }, region: { name: "Ahal" } }),
}));

const { id, photoId } = fixture;
type Screen = Awaited<ReturnType<typeof renderMobile>>;

const header = (screen: Screen, name: string) => screen.getByRole("header", { name });
const savedPayloads = () => fixture.patch.mock.calls.map(([request]) => request.payload);
const pause = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

/** Opens the latest draft from the Sell tab and waits for its photos to be read from the device. */
async function openCheck() {
  const screen = await renderMobile(<SellScreen />);
  await pause(20);
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await pause(20);
  header(screen, "Check and publish, Step 7 of 7");
  return screen;
}

beforeEach(() => {
  fixture.payload = fixture.complete;
  fixture.staged = { [`draft-${id}`]: [`${photoId}.jpg`] };
  fixture.stagingRead = null;
  fixture.patch.mockReset().mockResolvedValue({});
  fixture.presign.mockReset().mockResolvedValue({ uploadUrl: "http://localhost/put", key: "uploaded-again.jpg" });
  fixture.upload.mockReset().mockResolvedValue({ status: 200 });
  fixture.show.mockReset();
  fixture.mutation.mutateAsync.mockReset().mockResolvedValue({ id });
});

describe("Check and publish: changing a step (#588)", () => {
  it("shows the Listing as a card with one row per step", async () => {
    const screen = await openCheck();

    expect(screen.getByText("This is how buyers will see your listing")).toBeTruthy();
    expect(screen.getByTestId("check-preview-cover").props.source.uri).toContain(photoId);
    expect(screen.getAllByTestId("check-section")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Car, Toyota Camry, 2020, Change" })).toBeTruthy();
  });

  it("Change opens the step with Done in place of Continue, and Done returns to Check", async () => {
    const screen = await openCheck();

    await fireEvent.press(screen.getByRole("button", { name: /^Price, .*Change$/ }));

    header(screen, "Price, Step 4 of 7");
    expect(screen.getByRole("button", { name: "Done" }).props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Done" })); });

    header(screen, "Check and publish, Step 7 of 7");
    expect(screen.getByRole("button", { name: "Publish" }).props.accessibilityState).toMatchObject({ disabled: false });
    // Done saved the draft on Check, with its photo and every step still complete.
    expect(savedPayloads().at(-1)).toMatchObject({
      currentStep: 7,
      photos: fixture.savedPhotos,
      validatedSteps: ["vehicle", "specs", "photos", "price", "location", "contact"],
    });
  });

  it("the header's Back leaves the changed step for Check as well", async () => {
    const screen = await openCheck();
    await fireEvent.press(screen.getByRole("button", { name: /^Contact, .*Change$/ }));
    header(screen, "Contact, Step 6 of 7");

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Back" })); });

    header(screen, "Check and publish, Step 7 of 7");
  });
});

describe("Check and publish: publishing (#588)", () => {
  const publishCalls = () => fixture.mutation.mutateAsync.mock.calls;

  it("reads Publishing... while the Listing is published and ignores further taps", async () => {
    let finish = (_listing: { id: string }) => {};
    fixture.mutation.mutateAsync.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const screen = await openCheck();

    // Not awaited: RNTL 14's press resolves with the handler's promise, and
    // this publish stays pending until `finish` below.
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Publish" })); });

    const busy = screen.getByRole("button", { name: "Publishing..." });
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    await act(async () => { void fireEvent.press(busy); });
    expect(publishCalls()).toEqual([[id]]);
    // Neither ✕ nor a section leaves a publish that is under way.
    await fireEvent.press(screen.getByRole("button", { name: /^Price, / }));
    header(screen, "Check and publish, Step 7 of 7");

    await act(async () => { finish({ id }); });
    expect(publishCalls()).toHaveLength(1);
  });

  it("takes one publish from two quick taps", async () => {
    const screen = await openCheck();
    const button = screen.getByRole("button", { name: "Publish" });

    await act(async () => {
      void fireEvent.press(button);
      void fireEvent.press(button);
    });

    expect(publishCalls()).toEqual([[id]]);
  });

  it("saves the draft, then opens the Listing with a toast and closes the wizard", async () => {
    const screen = await openCheck();
    fixture.patch.mockClear();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Publish" })); });

    expect(savedPayloads().at(-1)).toMatchObject({ photos: fixture.savedPhotos, priceAmount: 100000 });
    expect(publishCalls()).toEqual([[id]]);
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${id}`);
    expect(fixture.show).toHaveBeenCalledWith({ title: "Listing published", variant: "success" });
    // No success screen and no Share: the wizard is gone and the Sell tab is back.
    expect(screen.queryByRole("header", { name: /Check and publish/ })).toBeNull();
    expect(screen.queryByText(/Share/)).toBeNull();
    expect(screen.getByText("Sell")).toBeTruthy();
  });
});

describe("Check and publish: a publish that fails (#588)", () => {
  const announcements = (AccessibilityInfo as unknown as { announcements: string[] }).announcements;
  const publish = (screen: Screen) => screen.getByRole("button", { name: "Publish" });

  async function publishAndFail(error: Error, payload = fixture.complete) {
    fixture.payload = payload;
    fixture.mutation.mutateAsync.mockRejectedValue(error);
    const screen = await openCheck();
    fixture.patch.mockClear();
    announcements.length = 0;
    await act(async () => { void fireEvent.press(publish(screen)); });
    return screen;
  }

  /** The wizard is still on Check, the draft was saved, and the error is the only message. */
  function expectStillOnCheck(screen: Screen, message: string) {
    header(screen, "Check and publish, Step 7 of 7");
    expect(within(screen.getByRole("alert")).getByText(message)).toBeTruthy();
    expect(announcements).toContain(message);
    expect(savedPayloads().at(-1)).toMatchObject({ photos: fixture.savedPhotos });
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(fixture.show).not.toHaveBeenCalled();
    expect(publish(screen).props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getAllByTestId("check-section")).toHaveLength(6);
  }

  it("a server error keeps the wizard on Check and says the draft is saved", async () => {
    const screen = await publishAndFail(new ApiError("INTERNAL_ERROR", 500, "Internal server error"));

    expectStillOnCheck(screen, "Could not publish. Your draft is saved. Try again.");
    // The server's own text is never shown.
    expect(screen.queryByText(/Internal server error/)).toBeNull();
  });

  it("being offline keeps the wizard on Check and says to publish when back online", async () => {
    const screen = await publishAndFail(new ApiError("NETWORK_ERROR", 0, "Network request failed"));

    expectStillOnCheck(screen, "No internet. Your draft is saved. Publish when you are back online.");
  });

  it("a missing exchange rate names the draft's currency", async () => {
    const screen = await publishAndFail(
      new ApiError("EXCHANGE_RATE_MISSING", 400, "Exchange rate from USD to TMT is not available"),
      { ...fixture.complete, priceAmount: 12500, priceCurrency: "USD" },
    );

    expectStillOnCheck(screen, "The USD rate is not available right now. Set the price in TMT or try later.");
  });

  it("publishes on the next try, and the error is gone while it runs", async () => {
    const screen = await publishAndFail(new ApiError("INTERNAL_ERROR", 500));
    let finish = (_listing: { id: string }) => {};
    fixture.mutation.mutateAsync.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));

    await act(async () => { void fireEvent.press(publish(screen)); });

    expect(screen.getByRole("button", { name: "Publishing..." })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => { finish({ id }); });

    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${id}`);
    expect(screen.queryByRole("header", { name: /Check and publish/ })).toBeNull();
  });

  it("lets the seller change a step after a failure, which clears the error", async () => {
    const screen = await publishAndFail(
      new ApiError("EXCHANGE_RATE_MISSING", 400),
      { ...fixture.complete, priceAmount: 12500, priceCurrency: "USD" },
    );

    await fireEvent.press(screen.getByRole("button", { name: /^Price, / }));

    header(screen, "Price, Step 4 of 7");
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Done" })); });
    header(screen, "Check and publish, Step 7 of 7");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Check and publish: a save before publishing that fails (#588)", () => {
  const publish = (screen: Screen) => screen.getByRole("button", { name: "Publish" });

  // The save is made to fail before Check opens. Failing it after a save of the
  // same payload succeeded would not reach the server: autosave skips a payload
  // it already saved.
  it.each([
    ["offline", new ApiError("NETWORK_ERROR", 0, "Network request failed")],
    ["a server error", new ApiError("INTERNAL_ERROR", 500, "Internal server error")],
  ])("%s sends no publish and keeps the wizard on Check with the save failure", async (_name, error) => {
    fixture.patch.mockRejectedValue(error);
    const screen = await openCheck();

    await act(async () => { void fireEvent.press(publish(screen)); });

    expect(fixture.patch).toHaveBeenCalled();
    expect(fixture.mutation.mutateAsync).not.toHaveBeenCalled();
    header(screen, "Check and publish, Step 7 of 7");
    expect(screen.queryByText(/Your draft is saved/)).toBeNull();
    expect(screen.getByRole("button", { name: "Not saved. Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publishing..." })).toBeNull();
    expect(publish(screen).props.accessibilityState).toMatchObject({ disabled: false });
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(fixture.show).not.toHaveBeenCalled();
  });

  it("publishes on the next tap once the save goes through", async () => {
    fixture.patch.mockRejectedValue(new ApiError("NETWORK_ERROR", 0, "Network request failed"));
    const screen = await openCheck();
    await act(async () => { void fireEvent.press(publish(screen)); });

    fixture.patch.mockReset().mockResolvedValue({});
    await act(async () => { void fireEvent.press(publish(screen)); });

    expect(fixture.mutation.mutateAsync.mock.calls).toEqual([[id]]);
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${id}`);
  });
});

describe("Check and publish: what blocks publishing (#588)", () => {
  const publish = (screen: Screen) => screen.getByRole("button", { name: "Publish" });
  const disabled = (screen: Screen) => publish(screen).props.accessibilityState?.disabled === true;
  const position = (screen: Screen, text: string) => JSON.stringify(screen.toJSON()).indexOf(text);
  const secondPhoto = "22222222-2222-4222-8222-222222222222";
  const lostPhoto = "33333333-3333-4333-8333-333333333333";

  /** Opens Price from Check, clears the amount and goes back with the header's Back. */
  async function leavePriceEmpty(screen: Screen) {
    await fireEvent.press(screen.getByRole("button", { name: /^Price, / }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear price" }));
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Back" })); });
    header(screen, "Check and publish, Step 7 of 7");
  }

  it("is ready to publish with nothing listed when the draft is complete", async () => {
    const screen = await openCheck();

    expect(disabled(screen)).toBe(false);
    expect(screen.queryByTestId("publish-blockers")).toBeNull();
  });

  it("says why Publish waits while the draft's photos are still being read from the device", async () => {
    let finishRead = () => {};
    fixture.stagingRead = new Promise((resolve) => { finishRead = resolve; });
    const screen = await openCheck();

    expect(disabled(screen)).toBe(true);
    expect(screen.getByText("Loading...")).toBeTruthy();

    await act(async () => { finishRead(); });
    await pause(20);

    expect(screen.queryByText("Loading...")).toBeNull();
    expect(disabled(screen)).toBe(false);
  });

  it("names the step left incomplete and disables Publish", async () => {
    const screen = await openCheck();

    await leavePriceEmpty(screen);

    expect(screen.getByText("Fill in: Price")).toBeTruthy();
    expect(disabled(screen)).toBe(true);
    expect(screen.getByRole("button", { name: "Price, Fill in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Car, .*Change$/ })).toBeTruthy();
  });

  it("counts the photos still uploading, and lets Publish go when they finish", async () => {
    // A second photo was compressed but not uploaded when the app closed.
    fixture.staged[`draft-${id}`] = [`${photoId}.jpg`, `${secondPhoto}.jpg`];
    let finishPresign = (_value: { uploadUrl: string; key: string }) => {};
    fixture.presign.mockImplementation(() => new Promise((resolve) => { finishPresign = resolve; }));
    const screen = await openCheck();

    expect(await screen.findByText("Photos still uploading: 1")).toBeTruthy();
    expect(disabled(screen)).toBe(true);

    await act(async () => { finishPresign({ uploadUrl: "http://localhost/put", key: `${secondPhoto}.jpg` }); });
    await pause(20);

    expect(screen.queryByText(/Photos still uploading/)).toBeNull();
    expect(disabled(screen)).toBe(false);
  });

  it("counts the photos that failed and sends the seller to Photos", async () => {
    // The draft names a photo that has no key and no file on the device.
    fixture.payload = {
      ...fixture.complete,
      photos: [...fixture.savedPhotos, { photoId: lostPhoto, sortOrder: 3 }],
    };
    const screen = await openCheck();

    expect(await screen.findByText("Photos failed: 1. Retry or remove them.")).toBeTruthy();
    expect(disabled(screen)).toBe(true);
    expect(screen.getByRole("button", { name: "Photos, Photos: 4, Fill in" })).toBeTruthy();
  });

  it("lists missing steps, then uploading photos, then failed photos", async () => {
    fixture.payload = {
      ...fixture.complete,
      photos: [...fixture.savedPhotos, { photoId: lostPhoto, sortOrder: 3 }],
    };
    fixture.staged[`draft-${id}`] = [`${photoId}.jpg`, `${secondPhoto}.jpg`];
    fixture.presign.mockImplementation(() => new Promise(() => {}));
    const screen = await openCheck();
    await screen.findByText("Photos still uploading: 1");

    await leavePriceEmpty(screen);

    const lines = ["Fill in: Price", "Photos still uploading: 1", "Photos failed: 1. Retry or remove them."];
    const [missing, uploading, failed] = lines.map((line) => position(screen, line)) as [number, number, number];
    expect(missing).toBeGreaterThan(-1);
    expect(missing).toBeLessThan(uploading);
    expect(uploading).toBeLessThan(failed);
    expect(failed).toBeLessThan(position(screen, '"Publish"'));
    expect(disabled(screen)).toBe(true);
  });
});
