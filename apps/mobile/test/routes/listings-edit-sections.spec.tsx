import * as RN from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { waitFor } from "@testing-library/react-native";

import EditListingScreen from "../../app/listings/[id]/edit";
import { getDraftDir } from "../../src/listings/uploadStaging/stagingDir";
import { server } from "../msw";
import { act, fireEvent, renderMobile, routeParams, routerMock, screenFocus, screenOptions } from "../render";

import { ToastProvider } from "@/components/ui/toast";

// Editing a published Listing from its section list (#589), with the real route,
// wizard machine, upload queue, save orchestration, steps and toast. Only the
// device and the network are faked: the session store, the file system, and the
// API through the fake server.

const pressHardwareBack = (RN as unknown as { pressHardwareBack: () => boolean }).pressHardwareBack;

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const coverId = "550e8400-e29b-41d4-a716-446655440001";
  const secondId = "550e8400-e29b-41d4-a716-446655440002";
  return { id, coverId, secondId };
});

vi.mock("../../src/auth/session", () => ({
  loadAuthSession: vi.fn(() => Promise.resolve({
    accessToken: "token-123", refreshToken: "refresh-123",
    user: { id: "u1", phone: "+99361000000", displayName: null, role: "seller" },
    storedAt: new Date().toISOString(),
  })),
  storeAuthSession: vi.fn(() => Promise.resolve()),
  clearAuthSession: vi.fn(() => Promise.resolve()),
  subscribeAuthSession: vi.fn(() => () => {}),
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  FileSystemUploadType: { BINARY_CONTENT: "BINARY_CONTENT" },
  getInfoAsync: vi.fn(async (uri: string) => ({ exists: false, uri })),
  readDirectoryAsync: vi.fn(async () => []),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
  copyAsync: vi.fn(async () => undefined),
  uploadAsync: vi.fn(),
}));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn(), launchCameraAsync: vi.fn() }));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg", WEBP: "webp" }, ImageManipulator: { manipulate: vi.fn() } }));
// The app-state and connectivity listeners are the OS's; nothing fires them here.
vi.mock("../../src/listings/uploadStaging/appStateResume", () => ({ setupUploadResume: () => () => undefined }));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));
// Native primitives the Node adapter cannot load.
vi.mock("@/components/ui/switch", async () => ({ Switch: (await import("react-native")).View }));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { id, coverId, secondId } = fixture;
const variants = { thumbnail: "t.webp", list: "l.webp", detail: "d.webp", fullscreen: "f.webp" };
type Screen = Awaited<ReturnType<typeof renderMobile>>;

/** The published Listing on the fake server, and what the app sent to change it. */
function createListingApi(overrides: Record<string, unknown> = {}) {
  const listing: Record<string, unknown> = {
    id, sellerId: id, publicNumber: 458, status: "active", brandId: id, modelId: id,
    year: 2020, vin: "WBA1234567890ABCD", condition: "used", mileageKm: 10000,
    priceAmount: 100000, priceCurrency: "TMT", displayPriceTmt: 100000,
    description: "One owner", regionId: id, cityId: id,
    contactPhone: "+99361000000", allowCalls: true, allowChat: true,
    acceptsExchange: false, installmentAvailable: false,
    conditionDisclosure: { damaged: false },
    media: [
      { id: coverId, kind: "image", key: `listings/${id}/${coverId}/original.webp`, variants, sortOrder: 0 },
      { id: secondId, kind: "image", key: `listings/${id}/${secondId}/original.webp`, variants, sortOrder: 1 },
      ...[2, 3].map((index) => ({ id: `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, kind: "image", key: `support-${index}.webp`, variants, sortOrder: index })),
    ],
    viewCount: 0, favoriteCount: 0, publishedAt: "2026-09-30T00:00:00.000Z",
    createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
    seller: { displayName: "Seller", nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
  const api = { listing, patches: [] as Record<string, unknown>[], removed: [] as string[], failEdits: 0 };
  const page = (items: unknown[]) => HttpResponse.json({ items, nextCursor: null, hasMore: false });

  server.use(
    http.get("*/catalog/brands", () => page([{ id, name: "Toyota", slug: "toyota" }])),
    http.get("*/catalog/brands/:brandId/models", () => page([{ id, name: "Camry", slug: "camry", brandId: id }])),
    http.get("*/catalog/*", () => page([])),
    http.get("*/exchange-rates*", () => HttpResponse.json({ rates: [] })),
    http.get("*/me/contact-phones", () => HttpResponse.json({ items: [] })),
    http.get("*/listings/:id", () => HttpResponse.json(api.listing)),
    http.patch("*/listings/:id", async ({ request }) => {
      if (api.failEdits > 0) {
        api.failEdits -= 1;
        return HttpResponse.json({ message: "temporarily unavailable" }, { status: 503 });
      }
      const patch = (await request.json()) as Record<string, unknown>;
      api.patches.push(patch);
      Object.assign(api.listing, patch);
      return HttpResponse.json(api.listing);
    }),
    http.delete("*/listings/:id/media/:mediaId", ({ params }) => {
      api.removed.push(String(params.mediaId));
      return HttpResponse.json({ success: true });
    }),
    http.put("*/listings/:id/media/order", () => HttpResponse.json({ success: true })),
  );
  return api;
}

/** Opens the edit screen and waits for the Listing and its photos. */
async function openEdit({ locale = "en", heading = "Edit listing" } = {}) {
  const screen = await renderMobile(<ToastProvider><EditListingScreen /></ToastProvider>, { locale });
  await screen.findByRole("header", { name: heading });
  await screen.findByText(/^Photos: 4$|^Фото: 4$|^Suratlar: 4$/);
  return screen;
}

const saveButton = (screen: Screen) => screen.getByRole("button", { name: "Save changes" });
const isDisabled = (button: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  button.props.accessibilityState?.disabled === true;

async function openStep(screen: Screen, row: RegExp, header: string) {
  await fireEvent.press(screen.getByRole("button", { name: row }));
  expect(screen.getByRole("header", { name: header })).toBeTruthy();
}

/** Types a new amount on the Price step and returns to the list with Done. */
async function changePrice(screen: Screen, from: string, to: string) {
  await openStep(screen, /^Price, .*Change$/, "Price");
  // The price field shows grouped digits; the typed text and the saved value are plain.
  await fireEvent.changeText(screen.getByDisplayValue(Number(from).toLocaleString("en-US")), to);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
}

/** What the RU and TK specs press, by the names a screen reader hears. */
const localized = {
  ru: { details: "Характеристики и состояние", notDamaged: "Битый или требует ремонта: Нет", done: "Готово" },
  tk: { details: "Aýratynlyklar we ýagdaýy", notDamaged: "Zeperli ýa-da abatlaýyş gerek: Ýok", done: "Tamam" },
} as const;

/** From the list: opens Details, answers Damaged "No" and returns with Done. */
async function answerNotDamaged(screen: Screen, locale: keyof typeof localized) {
  const names = localized[locale];
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${names.details}, `) }));
  await fireEvent.press(screen.getByRole("radio", { name: names.notDamaged }));
  await fireEvent.press(screen.getByRole("button", { name: names.done }));
}

beforeEach(() => {
  routeParams.id = id;
  routerMock.canGoBack.mockReturnValue(true);
});

afterEach(() => {
  vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => ({ exists: false, uri, isDirectory: false }));
});

describe("the section list of a published Listing (#589)", () => {
  it("saves a price change while preserving a locked legacy VIN", async () => {
    const api = createListingApi({ vin: "Corolla" });
    const screen = await openEdit();
    await changePrice(screen, "100000", "120000");
    expect(isDisabled(saveButton(screen))).toBe(false);
    await act(async () => { void fireEvent.press(saveButton(screen)); });
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect(api.patches[0]).toMatchObject({ priceAmount: 120000 });
    expect(api.patches[0]).not.toHaveProperty("vin");
    expect(api.listing.vin).toBe("Corolla");
  });

  it("never asks to fill in existing photos while loading or on the first ready render (#736)", async () => {
    createListingApi();
    const photoDir = getDraftDir(`edit-${id}`);
    let finishReadingPhotos = () => {};
    const photoRead = new Promise<FileSystem.FileInfo>((resolve) => {
      finishReadingPhotos = () => resolve({ exists: false, uri: photoDir, isDirectory: false });
    });
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) =>
      uri === photoDir ? photoRead : { exists: false, uri, isDirectory: false },
    );

    const photoRows: string[] = [];
    const observedScreen: { current?: Screen } = {};
    // RNTL 14's render settles every update before it returns, so the screen
    // mounts by rerender once the observer can query it, from its first render.
    const screen = await renderMobile(<></>);
    observedScreen.current = screen;
    await screen.rerender(
      <Profiler id="edit-photos" onRender={() => {
        const row = observedScreen.current?.queryAllByTestId("check-section")
          .find((item) => String(item.props.accessibilityLabel).startsWith("Photos, "));
        if (row) photoRows.push(String(row.props.accessibilityLabel));
      }}>
        <ToastProvider><EditListingScreen /></ToastProvider>
      </Profiler>,
    );
    await screen.findByRole("header", { name: "Edit listing" });
    expect(photoRows.length).toBeGreaterThan(0);
    expect(screen.queryByText("Photos: 4")).toBeNull();
    expect(screen.queryByText("At least 3 photos are required")).toBeNull();

    await act(async () => { finishReadingPhotos(); });
    await screen.findByText("Photos: 4");

    // Profiler observes each commit before the queue-to-payload effect can
    // settle it. A findBy query alone can skip the incorrect intermediate row.
    expect(photoRows.find((row) => row.includes("Photos: 4")))
      .toBe("Photos, Photos: 4, Change");
    expect(photoRows.filter((row) => row.includes("Fill in"))).toEqual([]);
  });

  it("opens on the Listing's sections under Edit listing, with the note about saving", async () => {
    createListingApi();
    const screen = await openEdit();

    expect(screen.getByText("Buyers see the changes only after you save.")).toBeTruthy();
    // The car's title under the heading.
    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    // The wizard's step order, VIN under Car and the description under its place.
    expect(screen.getAllByTestId("check-section").map((row) => String(row.props.accessibilityLabel)))
      .toEqual([
        "Car, Toyota Camry, 2020 · VIN WBA1234567890ABCD, Brand, model, generation, year and VIN cannot be changed after publishing.",
        "Details and condition, 10,000 km · Damaged / needs repair: No, Change",
        "Photos, Photos: 4, Change",
        "Price, 100,000 TMT, Change",
        "Description and place, One owner, Change",
        "Contact, +99361000000 · Phone calls, In-app chat, Change",
      ]);
    expect(screen.getByRole("button", { name: "Price, 100,000 TMT, Change" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photos, Photos: 4, Change" })).toBeTruthy();
    // Edit has no buyer preview, no Posting rules line and no Publish.
    expect(screen.queryByTestId("check-preview")).toBeNull();
    expect(screen.queryByText("This is how buyers will see your listing")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByText(/Step 7 of 7/)).toBeNull();
  });

  it.each([
    ["ru", "Редактировать объявление", "Покупатели увидят изменения только после сохранения."],
    ["tk", "Bildirişi redaktirle", "Alyjylar üýtgeşmeleri diňe saklananyňyzdan soň görer."],
  ])("heads the list and words the note in %s", async (locale, heading, note) => {
    createListingApi();
    const screen = await openEdit({ locale, heading });

    expect(screen.getByText(note)).toBeTruthy();
  });
});

describe("the locked Car row (#589)", () => {
  it("has no Change, says why, and is announced as not editable", async () => {
    createListingApi();
    const screen = await openEdit();

    const note = "Brand, model, generation, year and VIN cannot be changed after publishing.";
    expect(screen.getByText(note)).toBeTruthy();
    const row = await screen.findByLabelText(`Car, Toyota Camry, 2020 · VIN WBA1234567890ABCD, ${note}`);
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByRole("button", { name: /^Car, / })).toBeNull();

    // A tap on it opens nothing.
    await fireEvent.press(row);
    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it.each([
    ["ru", "Редактировать объявление", "Марку, модель, поколение, год и VIN нельзя изменить после публикации."],
    ["tk", "Bildirişi redaktirle", "Marka, model, nesil, ýyl we VIN neşirden soň üýtgedilmeýär."],
  ])("says why in %s", async (locale, heading, note) => {
    createListingApi();
    const screen = await openEdit({ locale, heading });

    expect(screen.getByText(note)).toBeTruthy();
  });
});

describe("changing a section (#589)", () => {
  it("Change opens the step with Done, and Done returns to the list with the new value", async () => {
    createListingApi();
    const screen = await openEdit();

    await openStep(screen, /^Price, .*Change$/, "Price");
    // Headed by the edit and the car, with no position in the wizard.
    expect(screen.getByText("Edit listing")).toBeTruthy();
    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(screen.queryByText(/Step \d of 7/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    await fireEvent.changeText(screen.getByDisplayValue("100,000"), "179000");
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Price, 179,000 TMT, Change" })).toBeTruthy();
  });

  it("keeps the seller on a step that is not valid", async () => {
    createListingApi();
    const screen = await openEdit();

    await openStep(screen, /^Price, .*Change$/, "Price");
    await fireEvent.changeText(screen.getByDisplayValue("100,000"), "");
    const done = screen.getByRole("button", { name: "Done" });
    expect(isDisabled(done)).toBe(true);
    await fireEvent.press(done);

    expect(screen.getByRole("header", { name: "Price" })).toBeTruthy();
  });

  it("Back on a step returns to the list and keeps what was typed", async () => {
    createListingApi();
    const screen = await openEdit();

    await openStep(screen, /^Price, .*Change$/, "Price");
    await fireEvent.changeText(screen.getByDisplayValue("100,000"), "179000");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Price, 179,000 TMT, Change" })).toBeTruthy();

    // Left invalid, the step is asked for again and nothing can be saved.
    await openStep(screen, /^Price, .*Change$/, "Price");
    await fireEvent.changeText(screen.getByDisplayValue("179,000"), "");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Price, .*Fill in$/ })).toBeTruthy();
    expect(isDisabled(saveButton(screen))).toBe(true);
  });
});

describe("Save changes (#589)", () => {
  it("cannot save an edited field before existing photos finish loading (#736)", async () => {
    const api = createListingApi();
    const photoDir = getDraftDir(`edit-${id}`);
    let finishReadingPhotos = () => {};
    const photoRead = new Promise<FileSystem.FileInfo>((resolve) => {
      finishReadingPhotos = () => resolve({ exists: false, uri: photoDir, isDirectory: false });
    });
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) =>
      uri === photoDir ? photoRead : { exists: false, uri, isDirectory: false },
    );
    const screen = await renderMobile(<ToastProvider><EditListingScreen /></ToastProvider>);
    await screen.findByRole("header", { name: "Edit listing" });
    await changePrice(screen, "100000", "179000");
    expect(screen.queryByText("Photos: 4")).toBeNull();
    expect(isDisabled(saveButton(screen))).toBe(true);

    try {
      // Exercise the rendered callback too: a disabled Pressable alone must
      // not be the guard against planning removals from an unloaded queue.
      await act(async () => { await saveButton(screen).props.onPress(); });
      expect(api.patches).toEqual([]);
      expect(api.removed).toEqual([]);
      expect(routerMock.replace).not.toHaveBeenCalled();
    } finally {
      await act(async () => { finishReadingPhotos(); });
    }

    await screen.findByText("Photos: 4");
    expect(isDisabled(saveButton(screen))).toBe(false);
    await act(async () => { void fireEvent.press(saveButton(screen)); });
    await waitFor(() => expect(api.patches).toEqual([expect.objectContaining({ priceAmount: 179000 })]));
    expect(api.removed).toEqual([]);
  });

  it("asks to fill in a ready photo set when fewer than three photos remain (#736)", async () => {
    createListingApi();
    const screen = await openEdit();
    await openStep(screen, /^Photos, .*Change$/, "Photos");
    await fireEvent.press(screen.getByRole("button", { name: "Remove: Photo 4 of 4" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove: Photo 3 of 3" }));
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Photos, Photos: 2, Fill in" })).toBeTruthy();
    expect(isDisabled(saveButton(screen))).toBe(true);
  });

  it("is disabled until a field differs from the published Listing, and again once the change is undone", async () => {
    createListingApi();
    const screen = await openEdit();
    expect(isDisabled(saveButton(screen))).toBe(true);

    await changePrice(screen, "100000", "179000");
    expect(isDisabled(saveButton(screen))).toBe(false);

    await changePrice(screen, "179000", "100000");
    expect(isDisabled(saveButton(screen))).toBe(true);
  });

  it("does not send anything while nothing changed", async () => {
    const api = createListingApi();
    const screen = await openEdit();

    await act(async () => { void fireEvent.press(saveButton(screen)); });

    expect(api.patches).toEqual([]);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("is enabled by a removed photo", async () => {
    createListingApi();
    const screen = await openEdit();

    await openStep(screen, /^Photos, .*Change$/, "Photos");
    await fireEvent.press(screen.getByRole("button", { name: "Remove: Photo 2 of 4" }));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: "Photos, Photos: 3, Change" })).toBeTruthy();
    expect(isDisabled(saveButton(screen))).toBe(false);
  });

  it("returns to the Listing with a Changes saved toast after a successful save", async () => {
    const api = createListingApi();
    const screen = await openEdit();
    await changePrice(screen, "100000", "179000");

    await act(async () => { void fireEvent.press(saveButton(screen)); });

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith(`/(public)/listings/${id}`));
    expect(api.patches).toEqual([expect.objectContaining({ priceAmount: 179000 })]);
    expect(screen.getByText("Changes saved")).toBeTruthy();
  });

  it("a failed save stays on the list with Retry and keeps every change", async () => {
    const api = createListingApi();
    api.failEdits = 1;
    const screen = await openEdit();
    await changePrice(screen, "100000", "179000");

    await act(async () => { void fireEvent.press(saveButton(screen)); });

    await screen.findByText("Couldn't save all changes. Try again.");
    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Price, 179,000 TMT, Change" })).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Changes saved")).toBeNull();
    // Still unsaved: leaving asks first.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));
    expect(routerMock.back).not.toHaveBeenCalled();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Retry" })); });

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith(`/(public)/listings/${id}`));
    expect(api.patches).toEqual([expect.objectContaining({ priceAmount: 179000 })]);
  });

  it("a failed save still counts as unsaved after the fields match the Listing again", async () => {
    const api = createListingApi();
    api.failEdits = 1;
    const screen = await openEdit();
    await changePrice(screen, "100000", "179000");
    await act(async () => { void fireEvent.press(saveButton(screen)); });
    await screen.findByText("Couldn't save all changes. Try again.");

    // Part of the edit may have reached the server (ADR-0025), so the seller can
    // still save, and leaving still asks.
    await changePrice(screen, "179000", "100000");

    expect(isDisabled(saveButton(screen))).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Leave edit mode?")).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it.each([
    ["ru", "Редактировать объявление", "Сохранить изменения", "Не удалось сохранить все изменения. Попробуйте ещё раз."],
    ["tk", "Bildirişi redaktirle", "Üýtgeşmeleri sakla", "Ähli üýtgeşmeleri saklap bolmady. Täzeden synanyşyň."],
  ])("words a failed save in %s", async (locale, heading, save, message) => {
    const api = createListingApi({ conditionDisclosure: { damaged: true } });
    api.failEdits = 1;
    const screen = await openEdit({ locale, heading });
    // One tap changes the Listing: the seller answers Damaged the other way.
    await answerNotDamaged(screen, locale as keyof typeof localized);

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: save })); });

    expect(await screen.findByText(message)).toBeTruthy();
  });
});

describe("returning from the contact phone code flow (#589)", () => {
  it("lands in the same edit, with the confirmed number and the earlier changes kept", async () => {
    const confirmed = "+99361111111";
    const api = createListingApi();
    server.use(
      http.get("*/me/contact-phones", () => HttpResponse.json({ items: [{
        phone: confirmed, source: "confirmed",
        confirmedAt: new Date().toISOString(),
        reusableUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }] })),
    );
    const screen = await openEdit();
    await changePrice(screen, "100000", "179000");
    await openStep(screen, /^Contact, .*Change$/, "Contact");
    await fireEvent.press(screen.getByLabelText("Another number"));
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone",
      params: { returnPathname: `/listings/${id}/edit` },
    });

    // The code screen confirms the number and returns with router.dismissTo: the
    // same edit screen comes back into focus with the number as a route param.
    routeParams.confirmedContactPhone = confirmed;
    await screen.rerender(<ToastProvider><EditListingScreen /></ToastProvider>);

    expect(routerMock.setParams).toHaveBeenCalledWith({ confirmedContactPhone: undefined });
    expect(screen.getByRole("header", { name: "Contact" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByLabelText(confirmed, { exact: false }).props.accessibilityState)
        .toMatchObject({ checked: true }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Price, 179,000 TMT, Change" })).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(`^Contact, \\${confirmed}`) })).toBeTruthy();
    // Still unsaved: leaving asks first.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Leave edit mode?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));

    await act(async () => { void fireEvent.press(saveButton(screen)); });

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith(`/(public)/listings/${id}`));
    expect(api.patches).toEqual([
      expect.objectContaining({ priceAmount: 179000, contactPhone: confirmed }),
    ]);
  });
});

describe("leaving the edit (#589)", () => {
  it("✕ with no changes closes at once", async () => {
    createListingApi();
    const screen = await openEdit();

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(routerMock.back).toHaveBeenCalledOnce();
    expect(screen.queryByText("Leave edit mode?")).toBeNull();
  });

  it("✕ with changes asks first; Keep editing stays and Leave closes", async () => {
    createListingApi();
    const screen = await openEdit();
    await changePrice(screen, "100000", "179000");

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByText("Leave edit mode?")).toBeTruthy();
    expect(screen.getByText("Any unsaved changes will be lost.")).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Leave edit mode?")).toBeNull();
    expect(screen.getByRole("button", { name: "Price, 179,000 TMT, Change" })).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(screen.getByRole("button", { name: "Leave" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });

  it("system back with no changes closes at once", async () => {
    createListingApi();
    await openEdit();

    let handled = false;
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(true);
    expect(routerMock.back).toHaveBeenCalledOnce();
  });

  it("system back with changes asks first, and a second back keeps editing", async () => {
    createListingApi();
    const screen = await openEdit();
    await changePrice(screen, "100000", "179000");

    await act(async () => { pressHardwareBack(); });
    expect(screen.getByText("Leave edit mode?")).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();

    await act(async () => { pressHardwareBack(); });
    expect(screen.queryByText("Leave edit mode?")).toBeNull();
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it("system back on a step returns to the list, not out of the edit", async () => {
    createListingApi();
    const screen = await openEdit();
    await openStep(screen, /^Price, .*Change$/, "Price");

    await act(async () => { pressHardwareBack(); });

    expect(screen.getByRole("header", { name: "Edit listing" })).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it("the iOS swipe back closes an unchanged edit, and cannot close one with changes", async () => {
    createListingApi();
    const screen = await openEdit();
    expect(screenOptions.current.gestureEnabled).toBe(true);

    await changePrice(screen, "100000", "179000");
    expect(screenOptions.current.gestureEnabled).toBe(false);

    await changePrice(screen, "179000", "100000");
    expect(screenOptions.current.gestureEnabled).toBe(true);
  });

  it("leaves system back to a screen opened over the edit", async () => {
    createListingApi();
    screenFocus.focused = false;
    await openEdit();

    let handled = true;
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(false);
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it.each([
    ["ru", "Редактировать объявление", "Закрыть",
      ["Выйти из режима редактирования?", "Несохранённые изменения будут потеряны.", "Выйти", "Продолжить редактирование"]],
    ["tk", "Bildirişi redaktirle", "Ýap",
      ["Redaktirlemeden çykmalymy?", "Saklanmadyk üýtgeşmeler ýitýär.", "Çyk", "Redaktirlemäge dowam et"]],
  ])("asks in %s", async (locale, heading, close, copy) => {
    createListingApi({ conditionDisclosure: { damaged: true } });
    const screen = await openEdit({ locale, heading });
    await answerNotDamaged(screen, locale as keyof typeof localized);

    await fireEvent.press(screen.getByRole("button", { name: close }));

    for (const text of copy) expect(screen.getByText(text)).toBeTruthy();
  });
});
