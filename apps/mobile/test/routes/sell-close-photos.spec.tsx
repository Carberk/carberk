import { waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SellScreen from "../../app/(tabs)/sell";
import { act, fireEvent, renderMobile } from "../render";

// The Sell route with the real upload queue and the real autosave, closed with ✕
// and opened again in one session. Only the device and the network are faked: the
// file system, compression, presign and upload, and the draft API.
const fixture = vi.hoisted(() => {
  const draft = (id: string, photoId: string) => {
    const savedPhoto = { photoId, key: `${photoId}.webp`, sortOrder: 0 };
    const savedPhotos = [savedPhoto, ...[1, 2].map((index) => ({
      ...savedPhoto, photoId: `${photoId.slice(0, -12)}${String(900 + index).padStart(12, "0")}`,
      key: `support-${photoId}-${index}.webp`, sortOrder: index,
    }))];
    return {
      id,
      photoId,
      savedPhoto,
    savedPhotos,
      payload: {
        brandId: id, modelId: id, year: 2020,
        condition: "used", mileageKm: 10000, conditionDisclosure: { damaged: false },
        photos: savedPhotos,
        priceAmount: 100000, priceCurrency: "TMT", description: "One owner", regionId: id, cityId: id,
        contactPhone: "+99365000000", allowCalls: true, allowChat: true,
      } as Record<string, unknown>,
    };
  };
  const a = draft("550e8400-e29b-41d4-a716-446655440000", "11111111-1111-4111-8111-111111111111");
  const b = draft("660e8400-e29b-41d4-a716-446655440001", "22222222-2222-4222-8222-222222222222");
  return {
    a,
    b,
    // Newest first, as the Sell tab lists them; Continue opens the first.
    drafts: [a] as { id: string; payload: Record<string, unknown> }[],
    // File names by staging directory, as the device would list them.
    staged: {} as Record<string, string[]>,
    // Set to hold a draft's directory listing open, like a slow device.
    listing: null as Promise<void> | null,
    patch: vi.fn(),
    presign: vi.fn(),
    upload: vi.fn(),
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
    const key = dir.replace("file:///documents/listing-staging/", "").replace(/\/$/, "");
    if (fixture.listing && key) await fixture.listing;
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
    data: { items: fixture.drafts.map((d) => ({ ...d, updatedAt: "2026-10-01T08:00:00.000Z" })) },
    isPending: false,
  }),
}));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => fixture.mutation }));
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
// Check and publish, reduced to the photos it was handed.
vi.mock("../../src/listings/wizard/CheckAndPublish", async () => {
  const { Text } = await import("react-native");
  return {
    default: ({ photos }: { photos: { photoId: string; key?: string; state: string }[] }) =>
      photos.map((p) => <Text key={p.photoId}>{`photo ${p.photoId} ${p.state} ${p.key ?? "no key"}`}</Text>),
  };
});
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));

const { a, b } = fixture;
const LATER_STEPS = ["photos", "price", "location", "contact"];
type Screen = ReturnType<typeof renderMobile>;

const publishButton = (screen: Screen) => screen.getByRole("button", { name: "Publish" });
const photoLine = (draft: typeof a) => `photo ${draft.photoId} attached ${draft.savedPhoto.key}`;
/** The payloads saved for one draft, in the order they were sent. */
const savedPayloads = (draftId: string) =>
  fixture.patch.mock.calls.map(([request]) => request).filter((r) => r.draftId === draftId).map((r) => r.payload);
// Longer than the autosave debounce, so a save the screen asked for has gone out.
const pause = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const letAutosaveRun = () => pause(700);

// The seller is on the Sell tab, where the queue has settled with no draft open,
// and taps Continue on the latest draft.
async function openSellTab() {
  const screen = renderMobile(<SellScreen />);
  await pause(20);
  return screen;
}
const pressContinue = (screen: Screen) => fireEvent.press(screen.getByRole("button", { name: "Continue" }));

async function closeWithX(screen: Screen) {
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Close" })); });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Close" })).toBeNull());
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
}

function expectDraftAsSaved(screen: Screen, draft: typeof a) {
  expect(screen.getByRole("header", { name: "Check and publish, Step 7 of 7" })).toBeTruthy();
  expect(screen.queryByText(/^Fill in: /)).toBeNull();
  expect(publishButton(screen).props.accessibilityState).toMatchObject({ disabled: false });
  // The photo kept its key and was not uploaded a second time.
  expect(screen.getByText(photoLine(draft))).toBeTruthy();
  expect(fixture.presign).not.toHaveBeenCalled();
  expect(fixture.upload).not.toHaveBeenCalled();
  // Every save carried the photo and the completed steps.
  expect(savedPayloads(draft.id).length).toBeGreaterThan(0);
  for (const payload of savedPayloads(draft.id)) {
    expect(payload.photos).toEqual(draft.savedPhotos);
    expect(payload.validatedSteps).toEqual(expect.arrayContaining(LATER_STEPS));
  }
}

beforeEach(() => {
  fixture.drafts = [a];
  fixture.staged = { [`draft-${a.id}`]: [`${a.photoId}.webp`], [`draft-${b.id}`]: [`${b.photoId}.webp`] };
  fixture.listing = null;
  fixture.patch.mockReset().mockResolvedValue({});
  fixture.presign.mockReset().mockResolvedValue({ uploadUrl: "http://localhost/put", key: "uploaded-again.webp" });
  fixture.upload.mockReset().mockResolvedValue({ status: 200 });
  fixture.mutation.mutateAsync.mockReset().mockResolvedValue({ id: a.id });
});

describe("Sell wizard, closing a draft with ✕ and opening one again in the same session (#585)", () => {
  it("reopens the same draft ready to publish, with the photo as it was saved", async () => {
    const screen = await openSellTab();
    pressContinue(screen);
    await screen.findByText(photoLine(a));
    await letAutosaveRun();

    await closeWithX(screen);
    await pause(20);
    pressContinue(screen);
    await screen.findByText(photoLine(a));
    await letAutosaveRun();

    expectDraftAsSaved(screen, a);
    fireEvent.press(publishButton(screen));
    await waitFor(() => expect(fixture.mutation.mutateAsync).toHaveBeenCalledWith(a.id));
    for (const payload of savedPayloads(a.id)) expect(payload.photos).toEqual(a.savedPhotos);
  });

  it("reopens it the same way when the seller taps Continue straight after ✕", async () => {
    const screen = await openSellTab();
    pressContinue(screen);
    await screen.findByText(photoLine(a));

    await closeWithX(screen);
    pressContinue(screen);
    await screen.findByText(photoLine(a));
    await letAutosaveRun();

    expectDraftAsSaved(screen, a);
  });

  it("shows another draft none of the photos of the one just closed", async () => {
    const screen = await openSellTab();
    pressContinue(screen);
    await screen.findByText(photoLine(a));
    await letAutosaveRun();
    await closeWithX(screen);

    // A newer draft now heads the Sell tab.
    fixture.drafts = [b, a];
    screen.rerender(<SellScreen />);
    pressContinue(screen);
    await screen.findByText(photoLine(b));
    await letAutosaveRun();

    expect(screen.queryByText(new RegExp(a.photoId))).toBeNull();
    expect(screen.getAllByText(/^photo /)).toHaveLength(3);
    for (const photo of b.savedPhotos) expect(screen.getByText(`photo ${photo.photoId} attached ${photo.key}`)).toBeTruthy();
    for (const photo of a.savedPhotos) expect(screen.queryByText(new RegExp(photo.photoId))).toBeNull();
    expectDraftAsSaved(screen, b);
    for (const payload of savedPayloads(a.id)) expect(payload.photos).toEqual(a.savedPhotos);
  });

  it("✕ before the device has listed the staged photos saves the draft with its photos", async () => {
    let release = () => {};
    fixture.listing = new Promise<void>((resolve) => { release = resolve; });
    const screen = await openSellTab();
    pressContinue(screen);
    await pause(20);

    await closeWithX(screen);
    await act(async () => { release(); });
    await letAutosaveRun();

    expect(savedPayloads(a.id).length).toBeGreaterThan(0);
    for (const payload of savedPayloads(a.id)) {
      expect(payload.photos).toEqual(a.savedPhotos);
      expect(payload.validatedSteps).toEqual(expect.arrayContaining(LATER_STEPS));
    }
  });
});
