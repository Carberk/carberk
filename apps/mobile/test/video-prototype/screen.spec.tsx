import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile } from "../render";
import { contrast, cssTokens, rgb } from "../tokens";
import { FakeLocalVideoAdapter } from "../../src/video-prototype/application/testing/FakeLocalVideoAdapter";
import { VideoUploadPrototype } from "../../src/video-prototype/VideoUploadPrototype";
import type { PreparedClip } from "../../src/video-prototype/state";
import VideoUploadPrototypeRoute from "../../app/(review)/video-upload-prototype";

vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_algorithm: string, data: string) => createHash("sha256").update(data).digest("hex") }));
afterEach(() => vi.unstubAllGlobals());

type Screen = Awaited<ReturnType<typeof renderMobile>>;
async function press(screen: Screen, name: string) { await fireEvent.press(screen.getByRole("button", { name })); }
async function choose(screen: Screen, duration = 90, entry = "Add video from library") {
  await press(screen, entry);
  await press(screen, `Choose ${duration}-second clip`);
}
async function preparing(screen: Screen) {
  await choose(screen);
  await press(screen, "Continue to poster");
  await press(screen, "Use video and prepare locally");
}
async function uploading(screen: Screen) {
  await preparing(screen);
  await press(screen, "Finish local preparation");
}
async function processing(screen: Screen) {
  await uploading(screen);
  for (let index = 0; index < 3; index++) await press(screen, "Upload next simulated chunk");
  await press(screen, "Start processing");
}
function status(screen: Screen, phase: string) { expect(screen.getByTestId("video-state").props.children).toBe(`Video state: ${phase}`); }

describe("local Listing video reviewer flow", () => {
  it("lets short and exact-90-second clips continue directly with optional trim", async () => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />);
    status(screen, "Empty slot");
    expect(screen.getByText("Required photos are publishable")).toBeTruthy();
    for (const duration of [45, 90]) {
      await choose(screen, duration);
      status(screen, "Preview");
      expect(screen.getByText("Trim is optional for this clip.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Trim video" })).toBeTruthy();
      expect(screen.getAllByLabelText(/Synthetic frame at/)).toHaveLength(5);
      await press(screen, "Continue to poster");
      status(screen, "Poster");
      await press(screen, "Remove video");
    }
  });
  it("requires long-source trimming, rejects 91 seconds and accepts exact 90 without rounding", async () => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />);
    await choose(screen, 120);
    expect(screen.queryByRole("button", { name: "Continue to poster" })).toBeNull();
    await press(screen, "Trim video");
    expect(screen.getByRole("adjustable", { name: "Video start" }).props.accessibilityValue.now).toBe(0);
    expect(screen.getByRole("adjustable", { name: "Video end" }).props.accessibilityValue.now).toBe(90);
    await press(screen, "Video end plus 1 second");
    expect(screen.getByText("Selection exceeds the 90-second maximum.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue to poster" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent(screen.getByRole("adjustable", { name: "Video end" }), "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(screen.getByTestId("selected-interval").props.children).toBe("Selected: 0s to 90s · 90s / 90s maximum");
    await press(screen, "Continue to poster");
    status(screen, "Poster");
    expect(screen.getByRole("button", { name: "Choose poster at 120s" }).props.accessibilityState.disabled).toBe(true);
  });
  it("keeps poster inside the interval when either trim handle moves", async () => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />);
    await choose(screen, 45);
    await press(screen, "Trim video");
    for (let index = 0; index < 6; index++) await press(screen, "Video start plus 1 second");
    expect(screen.getByTestId("selected-poster").props.children).toBe("Poster at 6s");
    await press(screen, "Continue to poster");
    await press(screen, "Choose poster at 45s");
    await press(screen, "Edit trim");
    await press(screen, "Video end minus 1 second");
    expect(screen.getByTestId("selected-poster").props.children).toBe("Poster at 44s");
    await press(screen, "Continue to poster");
    await press(screen, "Poster plus 1 second");
    expect(screen.getByTestId("selected-poster").props.children).toBe("Poster at 44s");
  });
  it("renders the adapter's prepared metadata and progress, including a boundary upload failure", async () => {
    const adapter = new FakeLocalVideoAdapter();
    const screen = await renderMobile(<VideoUploadPrototype adapter={adapter} />);
    await uploading(screen);
    expect(screen.getByTestId("prepared-size").props.children).toBe("Prepared synthetic descriptor: 28 bytes");
    expect(screen.getByText("Descriptor SHA-256: d9ef07d638d9f6810295a9820ba62eb33fd61cb1a542a5e498dcff3cb82f1d49")).toBeTruthy();
    await press(screen, "Upload next simulated chunk");
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(17);
    adapter.uploadError = true;
    await press(screen, "Upload next simulated chunk");
    status(screen, "Failed");
    await press(screen, "Continue with photos");
    expect(screen.getByTestId("optional-status").props.children).toBe("Optional video failed");
    await press(screen, "Return to video");
    status(screen, "Failed");
    adapter.uploadError = false;
    await press(screen, "Retry");
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(17);
    expect(screen.getByTestId("selected-poster").props.children).toBe("Poster at 5s");
    await press(screen, "Upload next simulated chunk");
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(63);
  });
  it("keeps preparation choices after boundary failure and discards prepared output on cancel", async () => {
    const adapter = new FakeLocalVideoAdapter();
    adapter.preparationError = true;
    const screen = await renderMobile(<VideoUploadPrototype adapter={adapter} />);
    await choose(screen, 45);
    await press(screen, "Trim video");
    await press(screen, "Video start plus 1 second");
    await press(screen, "Continue to poster");
    await press(screen, "Poster plus 1 second");
    await press(screen, "Use video and prepare locally");
    status(screen, "Preparing");
    await press(screen, "Finish local preparation");
    status(screen, "Failed");
    expect(screen.queryByTestId("prepared-size")).toBeNull();
    expect(adapter.staged.size).toBe(0);
    adapter.preparationError = false;
    await press(screen, "Retry");
    status(screen, "Preparing");
    expect(screen.getByTestId("selected-interval").props.children).toBe("Selected: 1s to 45s · 44s / 90s maximum");
    expect(screen.getByTestId("selected-poster").props.children).toBe("Poster at 6s");
    await press(screen, "Finish local preparation");
    await press(screen, "Cancel and discard staged output");
    status(screen, "Empty slot");
    expect(adapter.staged.size).toBe(0);
    expect(screen.getByText("Photos preserved: 3 required photos")).toBeTruthy();
  });
  it("discards a preparation result that arrives after cancel and cannot enter uploading", async () => {
    const adapter = new FakeLocalVideoAdapter();
    let resolve: (value: PreparedClip) => void = () => {};
    adapter.deferred = new Promise((done) => { resolve = done; });
    const screen = await renderMobile(<VideoUploadPrototype adapter={adapter} />);
    await preparing(screen);
    await press(screen, "Finish local preparation");
    await press(screen, "Cancel and discard staged output");
    await act(async () => { resolve(adapter.output); await adapter.deferred; });
    status(screen, "Empty slot");
    expect(adapter.staged.size).toBe(0);
    expect(screen.queryByRole("button", { name: "Upload next simulated chunk" })).toBeNull();
  });
  it("preserves explicit pause and pending status through photo review, then completes processing", async () => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />);
    await uploading(screen);
    await press(screen, "Upload next simulated chunk");
    await press(screen, "Pause upload");
    status(screen, "Paused");
    await press(screen, "Continue with photos");
    expect(screen.getByTestId("optional-status").props.children).toBe("Optional video pending");
    await press(screen, "Return to video");
    status(screen, "Paused");
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(17);
    await press(screen, "Resume upload");
    await press(screen, "Upload next simulated chunk");
    await press(screen, "Upload next simulated chunk");
    await press(screen, "Start processing");
    status(screen, "Processing");
    await press(screen, "Simulate processing failure");
    await press(screen, "Retry");
    status(screen, "Processing");
    expect(screen.queryByRole("button", { name: "Upload next simulated chunk" })).toBeNull();
    await press(screen, "Finish processing");
    status(screen, "Ready");
    await press(screen, "Continue with photos");
    expect(screen.getByTestId("optional-status").props.children).toBe("Active video ready");
    await press(screen, "Return to video");
    status(screen, "Ready");
  });
  it("retains the active ready video while its replacement is pending or removed", async () => {
    const adapter = new FakeLocalVideoAdapter();
    const screen = await renderMobile(<VideoUploadPrototype adapter={adapter} />);
    await processing(screen);
    await press(screen, "Finish processing");
    await choose(screen, 45, "Choose a replacement");
    expect(screen.getByText("Pending replacement: Preview")).toBeTruthy();
    expect(screen.getByTestId("active-status").props.children).toEqual(["Current ready video", ": ", "Ready"]);
    await press(screen, "Remove video");
    status(screen, "Ready");
    expect(adapter.staged.size).toBe(1);
    await press(screen, "Remove current ready video");
    status(screen, "Empty slot");
    expect(adapter.staged.size).toBe(0);
  });
  it("preserves fields, photos, trim and poster through denied/ineligible selection scenarios", async () => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />);
    await choose(screen, 45);
    await press(screen, "Continue to poster");
    await press(screen, "Poster plus 1 second");
    await press(screen, "Choose another video");
    await press(screen, "Deny synthetic permission");
    expect(screen.getByRole("button", { name: "Choose 90-second clip" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Photos preserved: 3 required photos")).toBeTruthy();
    expect(screen.getByText("Listing description: Synthetic Listing")).toBeTruthy();
    await press(screen, "Return to preserved selection");
    status(screen, "Poster");
    expect(screen.getByTestId("selected-poster").props.children).toBe("Poster at 6s");
    await press(screen, "Choose another video");
    await press(screen, "Use ineligible scenario");
    expect(screen.getByText("This synthetic account cannot select video. Photos and fields remain available.")).toBeTruthy();
    await press(screen, "Restore synthetic access");
    await press(screen, "Choose 90-second clip");
    status(screen, "Preview");
  });
});

describe("locale and semantic theme integration", () => {
  it.each([
    ["en", "Listing video upload prototype", "Add video from library"],
    ["ru", "Прототип загрузки видео объявления", "Добавить видео из галереи"],
    ["tk", "Bildirişiň wideosyny ýüklemek nusgasy", "Galereýadan wideo goşmak"],
  ])("uses the existing i18n provider in %s", async (locale, title, add) => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />, { locale });
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: add })).toBeTruthy();
    await act(async () => { await screen.i18n.changeLanguage("ru"); });
    expect(screen.getByRole("heading", { name: "Прототип загрузки видео объявления" })).toBeTruthy();
  });
  it.each(["light", "dark"] as const)("uses readable inherited semantic text and controls in %s tokens", async (theme) => {
    const screen = await renderMobile(<VideoUploadPrototype adapter={new FakeLocalVideoAdapter()} />);
    const title = screen.getByRole("heading", { name: "Listing video upload prototype" });
    expect(title.props.className).toContain("text-foreground");
    expect(title.props.className).toContain("font-heading");
    const action = screen.getByRole("button", { name: "Add video from library" });
    expect(action.props.className).toContain("bg-foreground");
    expect(screen.getByText("Add video from library").props.className).toContain("text-background");
    const tokens = cssTokens(theme);
    for (const [foreground, background] of [["foreground", "background"], ["foreground", "card"], ["muted-foreground", "background"], ["destructive-foreground", "destructive"]]) {
      expect(contrast(rgb(tokens[foreground ?? ""] ?? ""), rgb(tokens[background ?? ""] ?? ""))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("production route denial", () => {
  it.each([false, undefined])("denies prototype access when __DEV__ is %s", async (value) => {
    vi.stubGlobal("__DEV__", value);
    const screen = await renderMobile(<VideoUploadPrototypeRoute />);
    expect(screen.getByText("Review prototype unavailable")).toBeTruthy();
    expect(screen.queryByText("Listing video upload prototype")).toBeNull();
  });
  it("opens the local route in a development build", async () => {
    vi.stubGlobal("__DEV__", true);
    const screen = await renderMobile(<VideoUploadPrototypeRoute />);
    expect(screen.getByRole("button", { name: "Add video from library" })).toBeTruthy();
  });
});
