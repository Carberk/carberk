// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const { token } = await import("./testing/source-listing-platform");
  return { headers: async () => new Headers(), cookies: async () => ({
    get: (name: string) => name === "auto_tm_admin_access" ? { value: token } : undefined,
  }) };
});

import { historyListingAction } from "./listing-actions";
import { SourceListingMedia } from "./SourceListingMedia";
import { access, actor, deferred, fireTimer, photo, required, selection, session, source, sourceListingPlatform } from "./testing/source-listing-platform";

let world: ReturnType<typeof sourceListingPlatform>;
beforeEach(() => { world = sourceListingPlatform(); });
afterEach(async () => {
  cleanup();
  await vi.dynamicImportSettled();
  await new Promise<void>((resolve) => setImmediate(resolve));
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  vi.doUnmock("hls.js");
});

async function mount(overrides: Partial<ComponentProps<typeof SourceListingMedia>> = {}) {
  const locale = overrides.locale ?? "en";
  const detail = await historyListingAction(locale, { ...selection, kind: "detail" });
  if (detail.status !== "ok" || detail.kind !== "detail") throw new Error("Fixture detail refused");
  const props = { open: true, locale, ...selection, actorId: actor.id, detail, onInvalidate: vi.fn(), ...overrides };
  return { ...render(<SourceListingMedia {...props} />), props };
}

async function play(view: { container: HTMLElement }, label = "Play video", duration = 90) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
  await waitFor(() => expect(view.container.querySelector("video")).not.toBeNull());
  const element = required(view.container.querySelector("video"));
  await waitFor(() => expect(world.hls.supported ? world.hls.instances.at(-1)?.url : element.getAttribute("src")).toContain("m3u8?grant="));
  if (world.hls.supported) expect(required(world.hls.instances.at(-1)).element).toBe(element);
  expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).not.toContain(element);
  Object.defineProperty(element, "duration", { configurable: true, value: duration });
  fireEvent.loadedMetadata(element);
  if (world.hls.supported) act(() => required(world.hls.instances.at(-1)).emit("hlsManifestParsed"));
  await waitFor(() => expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(element));
  return element;
}

it("shows all permitted photos in deterministic order with real thumbnails and scoped keyboard selection", async () => {
  await mount();
  expect(screen.getByAltText("Photo 1 of 3").getAttribute("src")).toBe("https://photos.test/1/detail.webp");
  const first = screen.getByRole("button", { name: "Show photo 1" });
  expect(first.querySelector("img")?.getAttribute("src")).toBe("https://photos.test/1/thumbnail.webp");
  first.focus();
  fireEvent.keyDown(first, { key: "End" });
  expect(screen.getByAltText("Photo 3 of 3")).toBeTruthy();
  fireEvent.keyDown(first, { key: "Home" });
  expect(screen.getByAltText("Photo 1 of 3")).toBeTruthy();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(screen.getByAltText("Photo 2 of 3").getAttribute("src")).toBe("https://photos.test/2/detail.webp");
  expect(document.activeElement).toBe(first);
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  expect(screen.getByText("3 of 3 photos")).toBeTruthy();
  expect(world.seen.some(({ method }) => method === "POST")).toBe(false);
});

it("distinguishes failed photos from absence and retries only the currently permitted source", async () => {
  const view = await mount();
  fireEvent.error(screen.getByAltText("Photo 1 of 3"));
  expect(screen.getByRole("alert").textContent).toBe("Photo could not load.");
  world.listing.media = [photo(4)];
  fireEvent.click(screen.getByRole("button", { name: "Reload photos" }));
  await waitFor(() => expect(screen.getByAltText("Photo 1 of 1").getAttribute("src")).toBe("https://photos.test/4/detail.webp"));
  world.before = async (path) => path.includes("/vehicle-history/") ? Response.json({}, { status: 403 }) : undefined;
  fireEvent.error(screen.getByAltText("Photo 1 of 1"));
  fireEvent.click(screen.getByRole("button", { name: "Reload photos" }));
  await screen.findByText("Listing media is no longer available to you.");
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.props.onInvalidate).toHaveBeenCalledWith({ status: "denied" });
  expect(world.seen.every(({ path }) => !/owner|moderator|storage|upload/.test(path))).toBe(true);
});

it.each([
  ["en", "No photos added", "No video added"],
  ["ru", "Фотографии не добавлены", "Видео не добавлено"],
  ["tk", "Surat goşulmady", "Wideo goşulmady"],
] as const)("shows honest localized media absence in %s", async (locale, photos, video) => {
  world.listing.media = []; world.cover = { status: "none" };
  await mount({ locale });
  expect(screen.getByText(photos)).toBeTruthy();
  expect(await screen.findByText(video)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(world.seen.filter(({ path }) => path.includes("/video-access/")).map(({ path, method }) => [path, method]))
    .toEqual([[`/api/v1/listings/video-access/viewer/listing/${source}`, "GET"]]);
});

it("reads viewer cover independently and recovers network and image failure without requesting playback", async () => {
  world.before = async (path) => path.includes("/video-access/") ? Response.json({}, { status: 503 }) : undefined;
  await mount();
  expect(await screen.findByText("Video cover could not load.")).toBeTruthy();
  world.before = async () => undefined;
  fireEvent.click(screen.getByRole("button", { name: "Reload video cover" }));
  fireEvent.error(await screen.findByAltText("Video cover"));
  expect(screen.getByText("Video cover could not load.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reload video cover" }));
  expect(await screen.findByAltText("Video cover")).toBeTruthy();
  expect(world.seen.every(({ method }) => method === "GET")).toBe(true);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it.each(["HLS", "native"])("plays only after explicit Play with %s and detaches the exact player on Close", async (mode) => {
  world.hls.supported = mode === "HLS";
  const view = await mount();
  const element = await play(view);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(element.autoplay).toBe(false);
  element.currentTime = 4;
  view.rerender(<SourceListingMedia {...view.props} onInvalidate={vi.fn()} />);
  expect(element.currentTime).toBe(4);
  if (mode === "HLS") expect(world.hls.instances).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  expect(element.getAttribute("src")).toBeNull();
  fireEvent.loadedMetadata(element);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  if (mode === "HLS") {
    expect(required(world.hls.instances[0]).destroyed).toBe(true);
    expect(required(world.hls.instances[0]).handlers.size).toBe(0);
  }
  expect(world.seen.filter(({ method }) => method === "POST").map(({ path }) => path))
    .toEqual([`/api/v1/listings/video-access/viewer/listing/${source}/playback`]);
});

it.each(["HLS", "native"])("recovers %s fatal playback only on Retry, clamping the same generation and resetting its replacement", async (mode) => {
  world.hls.supported = mode === "HLS";
  const view = await mount();
  const element = await play(view);
  element.currentTime = 37;
  act(() => mode === "HLS" ? required(world.hls.instances.at(-1)).emit("hlsError", true) : fireEvent.error(element));
  expect(screen.getByText("Video could not play. Try again.")).toBeTruthy();
  expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(1);
  const renewed = await play(view, "Retry video", 20);
  expect(renewed.currentTime).toBe(20);
  renewed.currentTime = 12;
  world.playback = access(session, true);
  act(() => mode === "HLS" ? required(world.hls.instances.at(-1)).emit("hlsError", true) : fireEvent.error(renewed));
  const replacement = await play(view, "Retry video");
  expect(replacement.currentTime).toBe(0);
  Object.defineProperty(replacement, "currentTime", { configurable: true, writable: true, value: NaN });
  fireEvent.error(replacement);
  expect((await play(view, "Retry video")).currentTime).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  expect(screen.getByAltText("Video cover").getAttribute("src")).toContain(`/${session}/`);
});

it.each(["hidden", "offline", "pagehide", "popstate", "selection", "close", "dispose", "parent", "locale"])(
  "invalidates %s immediately and prevents detached events from reviving playback", async (reason) => {
    world.hls.supported = true;
    const view = await mount();
    const element = await play(view);
    const hls = required(world.hls.instances[0]);
    if (reason === "hidden") { vi.spyOn(document, "hidden", "get").mockReturnValue(true); fireEvent(document, new Event("visibilitychange")); }
    if (reason === "offline") { vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); fireEvent(window, new Event("offline")); }
    if (reason === "pagehide" || reason === "popstate") fireEvent(window, new Event(reason));
    if (reason === "selection") fireEvent.click(screen.getByRole("button", { name: "Show photo 2" }));
    if (reason === "close") fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    if (reason === "dispose") view.unmount();
    if (reason === "parent" || reason === "locale") view.rerender(<SourceListingMedia {...view.props} {...(reason === "parent" ? { open: false } : { locale: "ru" })} />);
    expect(hls.destroyed).toBe(true);
    expect(hls.handlers.size).toBe(0);
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(element);
    expect(element.getAttribute("src")).toBeNull();
    act(() => { hls.late("hlsManifestParsed"); hls.late("hlsError", true); fireEvent.loadedMetadata(element); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(1);
    if (["hidden", "offline", "pagehide", "popstate"].includes(reason)) expect(view.container.querySelector("img")).toBeNull();
  },
);

it("stops at grant expiry without renewal and restores position only after explicit Retry", async () => {
  const timers = vi.spyOn(globalThis, "setTimeout");
  const view = await mount();
  const element = await play(view);
  element.currentTime = 9;
  const expiry = timers.mock.calls.find(([, delay]) => Number(delay) > 290000);
  expect(expiry).toBeDefined();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 300001);
  act(() => fireTimer(required(expiry)[0]));
  expect(screen.getByText("Video access expired. Retry to check access and continue.")).toBeTruthy();
  expect(element.getAttribute("src")).toBeNull();
  expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(1);
  world.playback = access(selection.id, true);
  expect((await play(view, "Retry video")).currentTime).toBe(9);
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  expect(screen.getByAltText("Video cover")).toBeTruthy();
});

it.each(["close", "parent", "selection"])("rejects a delayed HLS import across %s and attaches only the replacement element", async (reason) => {
  world.hls.supported = true;
  const gate = deferred<undefined>(); world.hls.importGate = gate.promise;
  const view = await mount();
  fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
  await waitFor(() => expect(view.container.querySelector("video")).not.toBeNull());
  const old = required(view.container.querySelector("video"));
  await waitFor(() => expect(world.hls.entered).toBe(true));
  expect(world.hls.instances).toHaveLength(0);
  if (reason === "parent") {
    view.rerender(<SourceListingMedia {...view.props} open={false} />);
    view.rerender(<SourceListingMedia {...view.props} />);
  } else fireEvent.click(screen.getByRole("button", { name: reason === "close" ? "Close video" : "Show photo 2" }));
  // Vitest 5 bypasses a pending manual mock for a concurrent import; settle the cancelled import first.
  await act(async () => gate.resolve(undefined));
  await vi.dynamicImportSettled();
  expect(world.hls.instances).toHaveLength(0);
  expect(old.getAttribute("src")).toBeNull();
  const replacement = await play(view);
  await waitFor(() => expect(world.hls.instances).toHaveLength(1));
  expect(required(world.hls.instances[0]).element).toBe(replacement);
  expect(replacement).not.toBe(old); expect(old.getAttribute("src")).toBeNull();
  fireEvent.loadedMetadata(old);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

it.each(["resolve", "reject"])("a stale play promise %s cannot pause or change a newer player", async (outcome) => {
  const gate = deferred<undefined>();
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => gate.promise);
  const view = await mount();
  const old = await play(view);
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  const replacement = await play(view);
  replacement.currentTime = 4;
  vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
  await act(async () => outcome === "resolve" ? gate.resolve(undefined) : gate.reject(new Error("Late media refusal")));
  expect(replacement.getAttribute("src")).toContain("m3u8?grant=");
  expect(replacement.currentTime).toBe(4);
  expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts.every((element) => element === old)).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each((["detail", "cover", "play"] as const).flatMap((kind) =>
  ["request", "actor", "scope", "version", "locale", "source", "assignment", "refusal"].map((change) => [kind, change] as const),
))("discards delayed %s control after current %s changes", async (kind, change) => {
  const view = await mount();
  await screen.findByAltText("Video cover");
  const gate = deferred<undefined>();
  let reached = false;
  const target = kind === "detail" ? `/api/v1/listings/${source}`
    : `/api/v1/listings/video-access/viewer/listing/${source}${kind === "play" ? "/playback" : ""}`;
  world.before = async (path) => { if (path === target) { reached = true; await gate.promise; } return undefined; };
  try {
    if (kind !== "play") fireEvent.error(screen.getByAltText(kind === "detail" ? "Photo 1 of 3" : "Video cover"));
    fireEvent.click(await screen.findByRole("button", { name: { detail: "Reload photos", cover: "Reload video cover", play: "Play video" }[kind] }));
    await waitFor(() => expect(reached).toBe(true));
    if (change === "source") world.selected.sourceListingId = session;
    else if (change === "assignment") world.selected.assignmentVersion = 2;
    else if (change === "refusal") world.before = async (path) => path.includes("/vehicle-history/") ? Response.json({}, { status: 403 }) : undefined;
    else {
      const patch = change === "request" ? { id: session } : change === "actor" ? { actorId: session }
        : change === "scope" ? { scope: session } : change === "version" ? { expectedAssignmentVersion: 2 } : { locale: "ru" as const };
      view.rerender(<SourceListingMedia {...view.props} {...patch} />);
    }
  } finally { await act(async () => gate.resolve(undefined)); }
  expect(view.container.querySelector("video")).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  if (["source", "assignment", "refusal"].includes(change)) expect(view.props.onInvalidate).toHaveBeenCalled();
  expect(world.seen.every(({ path }) => !/owner|moderator|storage|upload/.test(path))).toBe(true);
});

it("offers useful unsupported recovery without fallback authority or automatic replay", async () => {
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
  const view = await mount();
  fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
  await screen.findByText("This browser cannot play this video. Try another browser.");
  expect(view.container.querySelector("video")).toBeNull();
  expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(1);
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("probably");
  expect((await play(view, "Retry video")).getAttribute("src")).toContain("/video-files/viewer/");
});

it.each(["hidden", "offline"])("%s recovery rechecks media only on Reload and never resumes automatically", async (reason) => {
  const view = await mount();
  const element = await play(view);
  element.currentTime = 7;
  const flag = reason === "hidden" ? vi.spyOn(document, "hidden", "get") : vi.spyOn(navigator, "onLine", "get");
  flag.mockReturnValue(reason === "hidden");
  fireEvent(reason === "hidden" ? document : window, new Event(reason === "hidden" ? "visibilitychange" : "offline"));
  expect(view.container.querySelector("video")).toBeNull();
  const reads = world.seen.length;
  flag.mockReturnValue(reason !== "hidden");
  fireEvent(reason === "hidden" ? document : window, new Event(reason === "hidden" ? "visibilitychange" : "online"));
  expect(world.seen).toHaveLength(reads);
  fireEvent.click(screen.getByRole("button", { name: "Reload media" }));
  await screen.findByAltText("Video cover");
  expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect((await play(view)).currentTime).toBe(7);
});

it("refuses a grant that expires while HLS is still importing", async () => {
  const gate = deferred<undefined>();
  world.hls.supported = true; world.hls.importGate = gate.promise;
  const view = await mount();
  fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
  await waitFor(() => expect(world.hls.entered).toBe(true));
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 300001);
  await act(async () => gate.resolve(undefined));
  await screen.findByText("Video access expired. Retry to check access and continue.");
  expect(view.container.querySelector("video")).toBeNull();
  expect(world.hls.instances).toHaveLength(0);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it.each(["cover", "play"] as const)("keeps permitted photos when viewer %s returns 404", async (kind) => {
  const refuse = async (path: string) => path.includes("/video-access/") ? Response.json({}, { status: 404 }) : undefined;
  if (kind === "cover") world.before = refuse;
  const view = await mount();
  if (kind === "play") {
    await screen.findByAltText("Video cover");
    world.before = refuse;
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
  }
  await screen.findByText(kind === "cover" ? "Video cover could not load." : "Video could not play. Try again.");
  expect(screen.getByAltText("Photo 1 of 3")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Show photo / })).toHaveLength(3);
  expect(view.props.onInvalidate).not.toHaveBeenCalled();
  expect(view.container.querySelector("video")).toBeNull();
  expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(kind === "play" ? 1 : 0);
});

it.each((["cover", "play"] as const).flatMap((kind) =>
  ["before", "finally", "catch"].map((stage) => [kind, stage] as const),
))("invalidates photos for hard History loss during %s at %s", async (kind, stage) => {
  const view = await mount();
  await screen.findByAltText("Video cover");
  let mediaReached = false, rechecksAfterMedia = 0;
  world.before = async (path) => {
    if (path.includes("/video-access/")) { mediaReached = true; return Response.json({}, { status: 404 }); }
    if (path.includes("/vehicle-history/operator/requests/")) {
      if (stage === "before" || (mediaReached && ++rechecksAfterMedia >= (stage === "finally" ? 1 : 2))) return Response.json({}, { status: 404 });
    }
    return undefined;
  };
  if (kind === "cover") fireEvent.error(screen.getByAltText("Video cover"));
  fireEvent.click(screen.getByRole("button", { name: kind === "cover" ? "Reload video cover" : "Play video" }));
  await screen.findByText("Media is unavailable. Try again.");
  expect(view.props.onInvalidate).toHaveBeenCalledWith({ status: "unavailable", scope: selection.scope });
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector("video")).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it.each(["thumbnail", "Home", "ArrowLeft", "End", "ArrowRight"].flatMap((control) =>
  ["photo", "thumbnail", "cover"].map((target) => [control, target] as const),
))("retains %s no-op selection load-error recovery for %s", async (control, target) => {
  const view = await mount();
  await screen.findByAltText("Video cover");
  const n = control === "End" || control === "ArrowRight" ? 3 : 1;
  const thumbnail = screen.getByRole("button", { name: `Show photo ${n}` });
  if (n === 3) fireEvent.keyDown(thumbnail, { key: "End" });
  if (control === "thumbnail") fireEvent.click(thumbnail);
  else fireEvent.keyDown(thumbnail, { key: control });
  const image = target === "cover" ? screen.getByAltText("Video cover")
    : target === "photo" ? screen.getByAltText(`Photo ${n} of 3`) : required(thumbnail.querySelector("img"));
  fireEvent.error(image);
  expect((target === "thumbnail" ? thumbnail : screen.getByRole("alert")).textContent).toBe(target === "cover" ? "Video cover could not load." : "Photo could not load.");
  expect(screen.getByRole("button", { name: target === "cover" ? "Reload video cover" : "Reload photos" })).toBeTruthy();
  expect(view.props.onInvalidate).not.toHaveBeenCalled();
});

it.each(["pending", "playing"])("current-photo selection cancels %s playback", async (phase) => {
  const view = await mount();
  await screen.findByAltText("Video cover");
  const gate = deferred<undefined>();
  let reached = false;
  if (phase === "pending") world.before = async (path) => {
    if (path.endsWith("/playback")) { reached = true; await gate.promise; }
    return undefined;
  };
  const element = phase === "playing" ? await play(view) : undefined;
  if (phase === "pending") {
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    await waitFor(() => expect(reached).toBe(true));
  }
  fireEvent.click(screen.getByRole("button", { name: "Show photo 1" }));
  await act(async () => gate.resolve(undefined));
  expect(view.container.querySelector("video")).toBeNull();
  expect(screen.getByAltText("Video cover")).toBeTruthy();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(phase === "playing" ? 1 : 0);
  if (element) expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(element);
});
