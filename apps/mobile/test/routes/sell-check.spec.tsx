import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../msw";
import { draftFailure, draftReceipt, publishedDraft, serveSellDraft } from "../fixtures/sell-draft";
import SellScreen from "../../app/(tabs)/sell";
import { act, fireEvent, renderMobile, routerMock, within } from "../render";

import { ToastProvider } from "@/components/ui/toast";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const photoId = "11111111-1111-4111-8111-111111111111";
  const savedPhoto = { photoId, key: `${photoId}.webp`, sortOrder: 0 };
  const savedPhotos = [savedPhoto, ...[1, 2].map((index) => ({
    ...savedPhoto, photoId: `${photoId.slice(0, -12)}${String(900 + index).padStart(12, "0")}`,
    key: `support-${photoId}-${index}.webp`, sortOrder: index,
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
    staged: {} as Record<string, string[]>,
    stagingRead: null as Promise<void> | null,
    patch: vi.fn(),
    presign: vi.fn(),
    upload: vi.fn(),
    publish: vi.fn(),
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
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { WEBP: "webp" } }));
vi.mock("@react-native-community/netinfo", () => ({ default: {
  addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }),
} }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@rn-primitives/progress", async () => ({
  Root: (await import("react-native")).View, Indicator: (await import("react-native")).View,
}));
vi.mock("@rn-primitives/dialog", async () => {
  const { View, Text } = await import("react-native");
  return { Root: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null,
    Trigger: View, Portal: View, Close: View, Overlay: View, Content: View, Title: Text, Description: Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));

const { id, photoId } = fixture;
type Screen = Awaited<ReturnType<typeof renderMobile>>;

const header = (screen: Screen, name: string) => screen.getByRole("header", { name });
const savedPayloads = () => fixture.patch.mock.calls.map(([payload]) => payload);
const pause = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

async function openCheck() {
  const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>);
  await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
  await screen.findByRole("header", { name: "Check and publish, Step 7 of 7" });
  return screen;
}

function presignReply(key: string) {
  return HttpResponse.json({ uploadUrl: "http://localhost/put", key, expiresIn: 60, maxSizeBytes: 1024,
    headers: { "if-match": '"empty"', "content-type": "image/webp" } });
}

beforeEach(async () => {
  fixture.payload = fixture.complete;
  fixture.staged = { [`draft-${id}`]: [`${photoId}.webp`] };
  fixture.stagingRead = null;
  fixture.patch.mockReset().mockImplementation((payload) => HttpResponse.json(draftReceipt(id, payload)));
  fixture.presign.mockReset().mockImplementation(() => presignReply("uploaded-again.webp"));
  fixture.upload.mockReset().mockResolvedValue({ status: 200 });
  fixture.publish.mockReset().mockImplementation(() => publishedDraft(id));
  await serveSellDraft(id, "+99365000000", () => fixture.payload);
  server.use(
    http.patch("*/listings/drafts/:id", async ({ request }) => fixture.patch(await request.json())),
    http.post("*/listings/drafts/:id/publish", ({ params }) => fixture.publish(params.id)),
    http.post("*/uploads/presign", () => fixture.presign()),
  );
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
  const publishCalls = () => fixture.publish.mock.calls;

  it("reads Publishing... while the Listing is published and ignores further taps", async () => {
    let finish = (_response: Response) => {};
    fixture.publish.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const screen = await openCheck();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Publish" })); });

    const busy = screen.getByRole("button", { name: "Publishing..." });
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    await act(async () => { void fireEvent.press(busy); });
    expect(publishCalls()).toEqual([[id]]);
    await fireEvent.press(screen.getByRole("button", { name: /^Price, / }));
    header(screen, "Check and publish, Step 7 of 7");

    await act(async () => { finish(publishedDraft(id)); });
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
    expect(await screen.findByText("Listing published")).toBeTruthy();
    expect(screen.queryByRole("header", { name: /Check and publish/ })).toBeNull();
    expect(screen.queryByText(/Share/)).toBeNull();
    expect(screen.getByText("Sell")).toBeTruthy();
  });
});

describe("Check and publish: a publish that fails (#588)", () => {
  const announcements = (AccessibilityInfo as unknown as { announcements: string[] }).announcements;
  const publish = (screen: Screen) => screen.getByRole("button", { name: "Publish" });

  async function publishAndFail(response: () => Response, payload = fixture.complete) {
    fixture.payload = payload;
    fixture.publish.mockImplementation(response);
    const screen = await openCheck();
    fixture.patch.mockClear();
    announcements.length = 0;
    await act(async () => { void fireEvent.press(publish(screen)); });
    return screen;
  }

  function expectStillOnCheck(screen: Screen, message: string, action = "Publish") {
    header(screen, "Check and publish, Step 7 of 7");
    expect(within(screen.getByRole("alert")).getByText(message)).toBeTruthy();
    expect(announcements).toContain(message);
    expect(savedPayloads().at(-1)).toMatchObject({ photos: fixture.savedPhotos });
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Listing published")).toBeNull();
    expect(screen.getByRole("button", { name: action }).props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getAllByTestId("check-section")).toHaveLength(6);
  }

  it("a server error keeps the publication uncertain and offers My listings", async () => {
    const screen = await publishAndFail(() => draftFailure("INTERNAL_ERROR", 500, "Internal server error"));

    expectStillOnCheck(screen, "Publication was not confirmed. The listing may be in My listings. Check before publishing again.", "My listings");
    expect(screen.queryByText(/Internal server error/)).toBeNull();
  });

  it("a lost response keeps the wizard on Check without promising a server draft", async () => {
    const screen = await publishAndFail(() => HttpResponse.error());

    expectStillOnCheck(screen, "Publication was not confirmed. The listing may be in My listings. Check before publishing again.", "My listings");
  });

  it("a missing exchange rate names the draft's currency", async () => {
    const screen = await publishAndFail(
      () => draftFailure("EXCHANGE_RATE_MISSING", 400, "Exchange rate from USD to TMT is not available"),
      { ...fixture.complete, priceAmount: 12500, priceCurrency: "USD" },
    );

    expectStillOnCheck(screen, "The USD rate is not available right now. Set the price in TMT or try later.");
  });

  it("publishes on the next try, and the error is gone while it runs", async () => {
    const screen = await publishAndFail(() => draftFailure("INVALID_DRAFT_PAYLOAD", 400));
    let finish = (_response: Response) => {};
    fixture.publish.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));

    await act(async () => { void fireEvent.press(publish(screen)); });

    expect(screen.getByRole("button", { name: "Publishing..." })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => { finish(publishedDraft(id)); });

    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${id}`);
    expect(screen.queryByRole("header", { name: /Check and publish/ })).toBeNull();
  });

  it("lets the seller change a step after a failure, which clears the error", async () => {
    const screen = await publishAndFail(
      () => draftFailure("EXCHANGE_RATE_MISSING", 400),
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

  it.each([
    ["offline", () => HttpResponse.error()],
    ["a server error", () => draftFailure("INTERNAL_ERROR", 500, "Internal server error")],
  ])("%s sends no publish and keeps the wizard on Check with the save failure", async (_name, error) => {
    fixture.patch.mockImplementation(error);
    const screen = await openCheck();

    await act(async () => { void fireEvent.press(publish(screen)); });

    expect(fixture.patch).toHaveBeenCalled();
    expect(fixture.publish).not.toHaveBeenCalled();
    header(screen, "Check and publish, Step 7 of 7");
    expect(screen.queryByText(/Your draft is saved/)).toBeNull();
    expect(screen.getByRole("button", { name: "Not saved. Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publishing..." })).toBeNull();
    expect(publish(screen).props.accessibilityState).toMatchObject({ disabled: false });
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Listing published")).toBeNull();
  });

  it("publishes on the next tap once the save goes through", async () => {
    fixture.patch.mockImplementation(() => HttpResponse.error());
    const screen = await openCheck();
    await act(async () => { void fireEvent.press(publish(screen)); });

    fixture.patch.mockReset().mockImplementation((payload) => HttpResponse.json(draftReceipt(id, payload)));
    await act(async () => { void fireEvent.press(publish(screen)); });

    expect(fixture.publish.mock.calls).toEqual([[id]]);
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${id}`);
  });
});

describe("Check and publish: what blocks publishing (#588)", () => {
  const publish = (screen: Screen) => screen.getByRole("button", { name: "Publish" });
  const disabled = (screen: Screen) => publish(screen).props.accessibilityState?.disabled === true;
  const position = (screen: Screen, text: string) => JSON.stringify(screen.toJSON()).indexOf(text);
  const secondPhoto = "22222222-2222-4222-8222-222222222222";
  const lostPhoto = "33333333-3333-4333-8333-333333333333";

  async function leavePriceEmpty(screen: Screen) {
    await fireEvent.press(screen.getByRole("button", { name: /^Price, / }));
    await fireEvent.changeText(screen.getByDisplayValue("100,000"), "");
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
    fixture.staged[`draft-${id}`] = [`${photoId}.webp`, `${secondPhoto}.webp`];
    let finishPresign = (_response: Response) => {};
    fixture.presign.mockImplementation(() => new Promise((resolve) => { finishPresign = resolve; }));
    const screen = await openCheck();

    expect(await screen.findByText("Photos still uploading: 1")).toBeTruthy();
    expect(disabled(screen)).toBe(true);

    await act(async () => { finishPresign(presignReply(`${secondPhoto}.webp`)); });
    await pause(20);

    expect(screen.queryByText(/Photos still uploading/)).toBeNull();
    expect(disabled(screen)).toBe(false);
  });

  it("counts the photos that failed and sends the seller to Photos", async () => {
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
    fixture.staged[`draft-${id}`] = [`${photoId}.webp`, `${secondPhoto}.webp`];
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
