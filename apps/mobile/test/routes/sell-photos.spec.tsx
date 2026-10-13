import { beforeEach, describe, expect, it, vi } from "vitest";

import SellScreen from "../../app/(tabs)/sell";
import { fireEvent, renderMobile, routeParams } from "../render";

import type { StagedPhoto } from "@/src/listings/uploadStaging/types";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const car = { brandId: id, modelId: id, year: 2020 };
  const details = { condition: "used", mileageKm: 10000, conditionDisclosure: { damaged: false } };
  const rest = {
    priceAmount: 100000, priceCurrency: "TMT", description: "One owner", regionId: id, cityId: id,
    contactPhone: "+99365000000", allowCalls: true, allowChat: true,
  };
  const ids = {
    a: "11111111-1111-4111-8111-111111111111",
    b: "22222222-2222-4222-8222-222222222222",
    c: "33333333-3333-4333-8333-333333333333",
  };
  return {
    id,
    ids,
    payloads: {
      // Car and Details are done, so a resumed draft opens on Photos.
      atPhotos: { ...car, ...details },
      complete: { ...car, ...details, photos: Object.values(ids).map((photoId, sortOrder) => ({ photoId, key: `${photoId}.webp`, sortOrder })), ...rest },
    } as Record<string, Record<string, unknown>>,
    payload: {} as Record<string, unknown>,
    queuePhotos: [] as StagedPhoto[],
    queueReady: false,
    gate: { canPublish: true, blockers: [] as string[] },
    save: vi.fn(),
    forceSave: vi.fn(),
    mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null },
  };
});
vi.mock("@react-navigation/native", async () => ({
  NavigationContext: (await import("react")).createContext(undefined),
}));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn(), launchCameraAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: vi.fn(async () => ({ exists: true })), copyAsync: vi.fn(async () => {}),
  makeDirectoryAsync: vi.fn(async () => {}), deleteAsync: vi.fn(async () => {}),
}));
vi.mock("../../src/api/listings/useMyDrafts", () => ({
  useMyDrafts: () => ({
    data: { items: [{ id: fixture.id, payload: fixture.payload }] },
    isPending: false,
  }),
}));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => fixture.mutation }));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({
  useWizardAutosave: () => ({
    save: fixture.save, forceSave: fixture.forceSave, retrySave: vi.fn(),
    saveStatus: "idle", saveError: null,
  }),
}));
// A new photos array on each render, like a queue that re-renders as uploads progress.
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({
  useUploadQueue: () => ({
    photos: [...fixture.queuePhotos], publishGate: fixture.gate,
    addPhoto: vi.fn(), removePhoto: vi.fn(), reorderPhotos: vi.fn(), retryPhoto: vi.fn(),
    isCompressing: false, isUploading: false, isReady: fixture.queueReady,
  }),
}));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, phone: "+99365000000" }) }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn(), setTopClearance: vi.fn() }) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step4Specs", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/CheckAndPublish", () => ({ default: () => null }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));

const { ids } = fixture;
const staged = (photoId: string, sortOrder: number, state: StagedPhoto["state"], extra: Partial<StagedPhoto> = {}): StagedPhoto => ({
  photoId, sortOrder, state, retryCount: 0, localUri: `file:///${photoId}.webp`, ...extra,
});
const keyed = (photoId: string, sortOrder: number) => staged(photoId, sortOrder, "uploaded", { key: `${photoId}.webp` });

function resume(payload: "atPhotos" | "complete") {
  if (payload === "complete") {
    for (const id of Object.values(ids)) if (fixture.queuePhotos.length < 3 && !fixture.queuePhotos.some((p) => p.photoId === id)) fixture.queuePhotos.push(keyed(id, fixture.queuePhotos.length));
  }
  fixture.payload = fixture.payloads[payload] ?? {};
  routeParams.resumeDraftId = fixture.id;
}

const continueButton = (screen: Awaited<ReturnType<typeof renderMobile>>) => screen.getByRole("button", { name: "Continue" });

beforeEach(() => {
  fixture.payload = {};
  fixture.queuePhotos = [];
  // The mocked queue already holds the open draft's photos, unless a test says not.
  fixture.queueReady = true;
  fixture.gate = { canPublish: true, blockers: [] };
  fixture.save.mockReset();
  fixture.forceSave.mockReset().mockResolvedValue(undefined);
});

describe("Sell wizard, Photos step", () => {
  it("requires three picked photos, explains the floor and nudges toward eight", async () => {
    fixture.queuePhotos = [keyed(ids.a, 0), keyed(ids.b, 1)];
    resume("atPhotos");
    const screen = await renderMobile(<SellScreen />);
    expect(continueButton(screen).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("At least 3 photos are required")).toBeTruthy();
    expect(screen.getByText("Photos: 2")).toBeTruthy();
    fixture.queuePhotos = [...fixture.queuePhotos, keyed(ids.c, 2)];
    await screen.rerender(<SellScreen />);
    expect(continueButton(screen).props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByText("Add 5 more for a better listing")).toBeTruthy();
  });

  it("opens on Photos with the minimum helper and will not continue below three", async () => {
    resume("atPhotos");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByRole("header", { name: "Photos, Step 3 of 7" })).toBeTruthy();
    expect(screen.getByText("At least 3 photos are required")).toBeTruthy();
    expect(continueButton(screen).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it.each([
    ["compressing", staged(ids.a, 0, "selected")],
    ["queued", staged(ids.a, 0, "compressed")],
    ["presigned", staged(ids.a, 0, "presigned")],
    ["uploading", staged(ids.a, 0, "uploading")],
    ["waiting for network", staged(ids.a, 0, "waiting_for_network")],
    ["failed", staged(ids.a, 0, "failed", { retryCount: 1, error: { code: "NETWORK_ERROR", message: "Offline", retryable: true } })],
    ["lost", staged(ids.a, 0, "lost", { localUri: undefined })],
    ["uploaded", keyed(ids.a, 0)],
  ])("Continue moves on with three picked photos including one that is %s", async (_name, photo) => {
    fixture.queuePhotos = [photo, keyed(ids.b, 1), keyed(ids.c, 2)];
    resume("atPhotos");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.queryByText("At least 3 photos are required")).toBeNull();
    expect(continueButton(screen).props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(continueButton(screen));

    expect(screen.getByRole("header", { name: "Price, Step 4 of 7" })).toBeTruthy();
  });

  it("does not put a photo without a key into the saved draft", async () => {
    fixture.queuePhotos = [staged(ids.a, 0, "uploading"), keyed(ids.b, 1), staged(ids.c, 2, "compressed")];
    resume("atPhotos");
    const screen = await renderMobile(<SellScreen />);
    await fireEvent.press(continueButton(screen));

    expect(fixture.forceSave).toHaveBeenCalled();
    for (const [payload] of [...fixture.forceSave.mock.calls, ...fixture.save.mock.calls]) {
      expect(payload.photos).toEqual([{ photoId: ids.b, key: `${ids.b}.webp`, sortOrder: 1 }]);
    }
  });

  it("saves nothing under photos when no picked photo has a key yet, and Publish would still need one", async () => {
    fixture.queuePhotos = [staged(ids.a, 0, "uploading"), staged(ids.b, 1, "compressed"), staged(ids.c, 2, "presigned")];
    resume("atPhotos");
    const screen = await renderMobile(<SellScreen />);
    await fireEvent.press(continueButton(screen));

    expect(fixture.forceSave).toHaveBeenCalledWith(expect.objectContaining({ photos: [] }));
  });

  it("saves the photos in the order the seller left them", async () => {
    fixture.queuePhotos = [keyed(ids.b, 0), keyed(ids.a, 1), keyed(ids.c, 2)];
    resume("atPhotos");
    const screen = await renderMobile(<SellScreen />);
    await fireEvent.press(continueButton(screen));

    expect(fixture.forceSave).toHaveBeenCalledWith(expect.objectContaining({
      photos: [
        { photoId: ids.b, key: `${ids.b}.webp`, sortOrder: 0 },
        { photoId: ids.a, key: `${ids.a}.webp`, sortOrder: 1 },
        { photoId: ids.c, key: `${ids.c}.webp`, sortOrder: 2 },
      ],
    }));
  });

});

describe("Sell wizard, upload status on later steps", () => {
  const withUploads = () => {
    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "uploading"), staged(ids.c, 2, "failed", {
      retryCount: 1, error: { code: "PUT_FAILED", message: "Upload failed — please retry", retryable: true },
    })];
  };

  it("shows the uploading and failed counts in the header, and the chip opens Photos", async () => {
    withUploads();
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByRole("header", { name: "Check and publish, Step 7 of 7" })).toBeTruthy();
    expect(screen.getByText("1 uploading")).toBeTruthy();
    expect(screen.getByText("1 failed")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "1 uploading, 1 failed" }));

    expect(screen.getByRole("header", { name: "Photos, Step 3 of 7" })).toBeTruthy();
  });

  it("names the failed photos above Publish and keeps Publish disabled", async () => {
    withUploads();
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsInProgress", "wizardErrors.uploadsFailed"] };
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByText("Photos failed: 1. Retry or remove them.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("names the uploading photos above Publish when none failed", async () => {
    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "uploading"), staged(ids.c, 2, "compressed")];
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsInProgress"] };
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByText("Photos still uploading: 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("counts a photo waiting for the network as still uploading", async () => {
    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "waiting_for_network")];
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsInProgress"] };
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByText("Photos still uploading: 1")).toBeTruthy();
    expect(screen.getByText("1 uploading")).toBeTruthy();
  });

  it("counts a lost photo as failed", async () => {
    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "lost", { localUri: undefined })];
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsFailed"] };
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByText("Photos failed: 1. Retry or remove them.")).toBeTruthy();
    expect(screen.getByText("1 failed")).toBeTruthy();
  });

  it.each([
    ["ru", "Ещё загружается фото: 1", "Не загрузилось фото: 1. Повторите или удалите."],
    ["tk", "Entek ýüklenýän surat: 1", "Ýüklenmedik surat: 1. Täzeden synanyşyň ýa-da aýryň."],
  ] as const)("words the Publish blockers in %s", async (locale, uploading, failed) => {
    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "uploading")];
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsInProgress"] };
    resume("complete");
    expect((await renderMobile(<SellScreen />, { locale })).getByText(uploading)).toBeTruthy();

    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "failed", { retryCount: 1 })];
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsFailed"] };
    expect((await renderMobile(<SellScreen />, { locale })).getByText(failed)).toBeTruthy();
  });

  it("keeps the earlier steps done while a photo's upload finishes, so Publish opens as soon as it does", async () => {
    // The draft holds the photo with its key; the queue still shows it uploading.
    fixture.queuePhotos = [staged(ids.a, 0, "uploading")];
    fixture.gate = { canPublish: false, blockers: ["wizardErrors.uploadsInProgress"] };
    resume("complete");
    const screen = await renderMobile(<SellScreen />);
    expect(screen.getByRole("button", { name: "Publish" }).props.accessibilityState).toMatchObject({ disabled: true });

    fixture.queuePhotos = [keyed(ids.a, 0), keyed(ids.b, 1), keyed(ids.c, 2)];
    fixture.gate = { canPublish: true, blockers: [] };
    await screen.rerender(<SellScreen />);

    expect(screen.getByRole("button", { name: "Publish" }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("keeps the later steps done when a resumed draft brings back a photo it had not saved", async () => {
    // The app closed while the second photo was uploading: only the first is in the draft.
    fixture.queuePhotos = [keyed(ids.a, 0), staged(ids.b, 1, "compressed")];
    fixture.queueReady = true;
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.getByRole("header", { name: "Check and publish, Step 7 of 7" })).toBeTruthy();
    expect(screen.queryByText(/^Fill in: /)).toBeNull();

    // A photo the seller adds afterwards is a change of theirs, and is checked again.
    fixture.queuePhotos = [...fixture.queuePhotos, staged("44444444-4444-4444-8444-444444444444", 3, "selected")];
    await screen.rerender(<SellScreen />);
    expect(screen.getByText(/^Fill in: /)).toBeTruthy();
  });

  it("can publish once every photo is attached", async () => {
    fixture.queuePhotos = [keyed(ids.a, 0)];
    resume("complete");
    const screen = await renderMobile(<SellScreen />);

    expect(screen.queryByText(/Photos still uploading|Photos failed/)).toBeNull();
    expect(screen.getByRole("button", { name: "Publish" }).props.accessibilityState).toMatchObject({ disabled: false });
  });
});
