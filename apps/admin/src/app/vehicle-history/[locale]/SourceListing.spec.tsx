// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const { token } = await import("./testing/source-listing-platform");
  return { headers: async () => new Headers(), cookies: async () => ({
    get: (name: string) => name === "auto_tm_admin_access" ? { value: token } : undefined,
  }) };
});

import { SourceListing } from "./SourceListing";
import { actor, deferred, required, selection, source, sourceListingPlatform } from "./testing/source-listing-platform";

let world: ReturnType<typeof sourceListingPlatform>;
beforeEach(() => { world = sourceListingPlatform(); });
afterEach(async () => {
  cleanup();
  await vi.dynamicImportSettled();
  await new Promise<void>((resolve) => setImmediate(resolve));
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  vi.doUnmock("hls.js");
});

it("reads permitted details and media in a labelled dialog whose visibility remains controlled", async () => {
  const onClose = vi.fn();
  const props = { open: true, locale: "en" as const, ...selection, actorId: actor.id,
    onClose, onInvalidate: vi.fn() };
  const view = render(<SourceListing {...props} />);
  const dialog = await screen.findByRole("dialog", { name: "Listing 1270" });
  expect(dialog.hasAttribute("open")).toBe(true);
  expect(screen.getByText("Public car")).toBeTruthy();
  expect(screen.getByAltText("Photo 1 of 3").getAttribute("src")).toBe("https://photos.test/1/detail.webp");
  expect(await screen.findByAltText("Video cover")).toBeTruthy();
  expect(world.seen.some(({ path }) => path === `/api/v1/listings/${source}`)).toBe(true);
  expect(world.seen.some(({ method }) => method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  view.rerender(<SourceListing {...props} open={false} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(view.container.querySelector("img")).toBeNull();
});

it("shows a seller's zero mileage as a permitted specification", async () => {
  world.listing.mileageKm = 0;
  const props = {
    open: true,
    locale: "en" as const,
    ...selection,
    actorId: actor.id,
    onClose: vi.fn(),
    onInvalidate: vi.fn(),
  };
  render(<SourceListing {...props} />);
  await screen.findByRole("dialog", { name: "Listing 1270" });
  expect(screen.getByText("Mileage").tagName).toBe("DT");
  expect(screen.getByText("0 km").tagName).toBe("DD");
  expect(screen.getByText("Public car")).toBeTruthy();
  expect(props.onInvalidate).not.toHaveBeenCalled();
});

it("shows the complete permitted public facts with seller attribution and decoder uncertainty", async () => {
  Object.assign(world.listing, {
    generationId: source, vin: "JTDKN3DU0A0000001", mileageKm: 0, colorId: source, bodyTypeId: source,
    transmissionId: source, driveTypeId: source, engineTypeId: source, enginePower: 150,
    priceAmount: 20000, priceCurrency: "USD", displayPriceTmt: 70000, locationText: "City centre",
    status: "sold", soldAt: "2026-11-16T01:02:00.000Z", acceptsExchange: false, installmentAvailable: true,
    conditionDisclosure: { damaged: false, knownIssuesText: "Small scratch" },
    vinHistory: { decoded: true, brand: "Toyota", model: "Prius", year: 2020,
      bodyType: "Hatchback", engineType: "Hybrid", confidence: 0.9 },
  });
  const names: Record<string, string> = { brands: "Toyota", models: "Prius", generations: "XW50",
    regions: "Ahal", cities: "Ashgabat", colors: "White", "body-types": "Hatchback",
    "engine-types": "Hybrid", transmissions: "Automatic", "drive-types": "Front-wheel drive" };
  world.before = async (path) => {
    if (!path.includes("/catalog/")) return undefined;
    const family = path.split("/").at(-1) ?? "";
    const parent = family === "models" ? { brandId: source } : family === "generations" ? { modelId: source }
      : family === "cities" ? { regionId: source } : {};
    return Response.json({ items: [{ id: source, name: names[family], slug: "fixture", ...parent }],
      nextCursor: null, hasMore: false });
  };
  const view = render(<SourceListing open locale="en" {...selection} actorId={actor.id}
    onClose={vi.fn()} onInvalidate={vi.fn()} />);
  await screen.findByRole("dialog", { name: "Listing 1270" });
  expect(screen.getByRole("heading", { name: "Toyota Prius XW50 · 2020" })).toBeTruthy();
  const expected = [
    ["Price", "20,000 USD"],
    ["Price in TMT", "70,000 TMT"],
    ["Location", "Ahal · Ashgabat · City centre"],
    ["Year", "2020"],
    ["VIN", "JTDKN3DU0A0000001"],
    ["Condition", "Used"],
    ["Mileage", "0 km"],
    ["Color", "White"],
    ["Body type", "Hatchback"],
    ["Transmission", "Automatic"],
    ["Drive type", "Front-wheel drive"],
    ["Engine type", "Hybrid"],
    ["Engine power", "150 hp"],
    ["Exchange accepted", "No"],
    ["Installments available", "Yes"],
    ["Status", "Sold"],
    ["Published", "15/11/2026, 05:00 UTC+5"],
    ["Sold", "16/11/2026, 06:02 UTC+5"],
    ["Created", "15/11/2026, 05:00 UTC+5"],
    ["Updated", "15/11/2026, 05:00 UTC+5"],
    ["Seller", "Seller"],
    ["Member since", "15/11/2026, 05:00 UTC+5"],
    ["Damaged or needs repair · seller stated", "No"],
    ["Known issues · seller stated", "Small scratch"],
    ["VIN decoder", "Toyota · Prius · 2020 · Hatchback · Hybrid"],
    ["Decoder confidence", "90% · Decoded data does not verify the vehicle or its condition."],
  ];
  for (const [label, value] of expected) {
    const term = [...view.container.querySelectorAll("dt")].find((node) => node.textContent === label);
    expect(term?.nextElementSibling?.textContent).toBe(value);
  }
  expect(screen.getByText("Public car")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button", { name: /contact|favorite|edit|upload|moderate/i })).toBeNull();
  expect(world.seen.every(({ path, method }) => method === "GET" && !/owner|moderator|contacts/.test(path))).toBe(true);
});

it.each([
  ["en", "Listing 1270", "Close listing", "Mileage", "0 km", "Deleted seller", "Not decoded", "Not provided", "No"],
  ["ru", "Объявление 1270", "Закрыть объявление", "Пробег", "0 км", "Продавец удалён", "Не расшифрован", "Не указано", "Нет"],
  ["tk", "Bildiriş 1270", "Bildirişi ýap", "Ýörişi", "0 km", "Satyjy öçürilen", "Maglumat çözülemedi", "Görkezilmedik", "Ýok"],
] as const)("keeps sparse, false and undecoded facts honest in %s", async (locale, title, close, mileage, distance, seller, decoder, absent, no) => {
  world.listing.mileageKm = 0;
  world.listing.seller.deleted = true;
  world.listing.vinHistory = { decoded: false };
  world.listing.installmentAvailable = false;
  delete world.listing.description;
  delete world.listing.conditionDisclosure;
  render(<SourceListing open locale={locale} {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  await screen.findByRole("dialog", { name: title });
  expect(screen.getByRole("button", { name: close })).toBeTruthy();
  expect(screen.getByText(mileage).nextElementSibling?.textContent).toBe(distance);
  expect(screen.getByText(seller)).toBeTruthy();
  expect(screen.getByText(decoder)).toBeTruthy();
  expect(screen.getAllByText(absent).length).toBeGreaterThan(0);
  expect(screen.getAllByText(no).length).toBeGreaterThan(1);
  expect(screen.queryByText("Seller", { selector: "dd" })).toBeNull();
  expect(screen.queryByText(/90%/)).toBeNull();
  expect(screen.queryByText(source)).toBeNull();
});

it.each([
  ["absent", "This enquiry has no source Listing."],
  ["not-found", "This Listing is no longer available."],
  ["denied", "Access denied. Close the Listing or retry after access is restored."],
  ["expired", "Your session is no longer available. Close the Listing and sign in again."],
  ["conflict", "The assignment changed. Close the Listing and refresh the enquiry."],
  ["unavailable", "The Listing could not load. Check your connection and retry."],
] as const)("shows recoverable %s without losing its safe Close action", async (state, message) => {
  world.before = async (path) => {
    if (state === "absent" && path.includes("/operator/requests/")) return Response.json({ ...world.selected, sourceListingId: null });
    if (state === "conflict" && path.includes("/operator/requests/")) return Response.json({ ...world.selected, assignmentVersion: 2 });
    if (state === "denied" || state === "expired") return Response.json({}, { status: state === "denied" ? 403 : 401 });
    if (path === `/api/v1/listings/${source}`) return Response.json({}, { status: state === "not-found" ? 404 : 503 });
    return undefined;
  };
  const onClose = vi.fn();
  const onInvalidate = vi.fn();
  render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={onClose} onInvalidate={onInvalidate} />);
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByText("Public car")).toBeNull();
  expect(screen.queryByAltText("Video cover")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  world.before = async () => undefined;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Public car")).toBeTruthy();
  expect(world.seen.every(({ method }) => method === "GET")).toBe(true);
});

it("announces a delayed read and recovers an actual transport rejection only on Retry", async () => {
  const gate = deferred<undefined>();
  world.before = async (path) => { if (path === `/api/v1/listings/${source}`) { await gate.promise; throw new TypeError("offline transport"); } return undefined; };
  render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toBe("Loading Listing…");
  await act(async () => gate.resolve(undefined));
  expect(await screen.findByRole("alert")).toBeTruthy();
  world.before = async () => undefined;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Public car")).toBeTruthy();
});

it("contains keyboard focus, signals Escape and restores the invoking control on controlled close", async () => {
  const invoker = document.createElement("button");
  invoker.textContent = "View source";
  document.body.append(invoker);
  invoker.focus();
  const onClose = vi.fn();
  const props = { open: true, locale: "en" as const, ...selection, actorId: actor.id, onClose, onInvalidate: vi.fn() };
  const view = render(<SourceListing {...props} />);
  const dialog = await screen.findByRole("dialog", { name: "Listing 1270" });
  const heading = screen.getByRole("heading", { name: "Listing 1270" });
  expect(document.activeElement).toBe(heading);
  const close = screen.getByRole("button", { name: "Close listing" });
  const play = await screen.findByRole("button", { name: "Play video" });
  play.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(play);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Public car")).toBeNull();
  view.rerender(<SourceListing {...props} open={false} />);
  await waitFor(() => expect(document.activeElement).toBe(invoker));
  invoker.remove();
});

it.each(["hidden", "offline", "pagehide", "popstate"])("clears protected facts on %s and requires an explicit current read to recover", async (reason) => {
  const onClose = vi.fn();
  render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={onClose} onInvalidate={vi.fn()} />);
  await screen.findByText("Public car");
  let restore = () => {};
  if (reason === "hidden") {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    restore = () => { hidden.mockReturnValue(false); };
    fireEvent(document, new Event("visibilitychange"));
  } else if (reason === "offline") {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    restore = () => { online.mockReturnValue(true); };
    fireEvent(window, new Event("offline"));
  } else fireEvent(window, new Event(reason));
  expect(screen.queryByText("Public car")).toBeNull();
  expect(document.querySelector("img")).toBeNull();
  const reads = world.seen.length;
  restore();
  fireEvent(window, new Event("online"));
  fireEvent(document, new Event("visibilitychange"));
  expect(world.seen).toHaveLength(reads);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Public car")).toBeTruthy();
  expect(world.seen.every(({ method }) => method === "GET")).toBe(true);
  if (reason === "popstate") expect(onClose).toHaveBeenCalledTimes(1);
});

it.each(["close", "dispose", "locale", "request", "scope", "actor", "version"])("discards a delayed detail across %s", async (change) => {
  const gate = deferred<undefined>();
  let reached = false;
  world.before = async (path) => {
    if (path === `/api/v1/listings/${source}` && !reached) { reached = true; await gate.promise; }
    return undefined;
  };
  const props = { open: true, locale: "en" as const, ...selection, actorId: actor.id, onClose: vi.fn(), onInvalidate: vi.fn() };
  const view = render(<SourceListing {...props} />);
  await waitFor(() => expect(reached).toBe(true));
  world.before = async () => Response.json({}, { status: 403 });
  if (change === "dispose") view.unmount();
  else view.rerender(<SourceListing {...props} {...(change === "close" ? { open: false }
    : change === "locale" ? { locale: "ru" as const } : change === "request" ? { id: actor.id }
      : change === "scope" ? { scope: "a".repeat(64) } : change === "actor" ? { actorId: source }
        : { expectedAssignmentVersion: 2 })} />);
  await act(async () => gate.resolve(undefined));
  expect(screen.queryByText("Public car")).toBeNull();
  expect(view.container.querySelector("img")).toBeNull();
  expect(world.seen.every(({ method }) => method === "GET")).toBe(true);
});

it.each(["HLS", "native"])("composes explicit %s playback, video-local refusal and hard History invalidation", async (mode) => {
  world.hls.supported = mode === "HLS";
  const invalidated = vi.fn();
  const view = render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={invalidated} />);
  await screen.findByAltText("Video cover");
  world.before = async (path) => path.includes("/video-access/") ? Response.json({}, { status: 404 }) : undefined;
  fireEvent.click(screen.getByRole("button", { name: "Play video" }));
  await screen.findByText("Video could not play. Try again.");
  expect(screen.getByText("Public car")).toBeTruthy();
  expect(invalidated).not.toHaveBeenCalled();
  world.before = async () => undefined;
  fireEvent.click(screen.getByRole("button", { name: "Retry video" }));
  await waitFor(() => expect(view.container.querySelector("video")).not.toBeNull());
  const video = required(view.container.querySelector("video"));
  await waitFor(() => expect(mode === "HLS" ? world.hls.instances.at(-1)?.url : video.src).toContain("m3u8"));
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent.loadedMetadata(video);
  if (mode === "HLS") act(() => required(world.hls.instances.at(-1)).emit("hlsManifestParsed"));
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  expect(video.getAttribute("src")).toBeNull();
  if (mode === "HLS") expect(required(world.hls.instances[0]).destroyed).toBe(true);
  world.before = async (path) => path.includes("/vehicle-history/") ? Response.json({}, { status: 403 }) : undefined;
  fireEvent.error(screen.getByAltText("Video cover"));
  fireEvent.click(screen.getByRole("button", { name: "Reload video cover" }));
  await screen.findByText("Access denied. Close the Listing or retry after access is restored.");
  expect(screen.queryByText("Public car")).toBeNull();
  expect(view.container.querySelector("img")).toBeNull();
  expect(invalidated).toHaveBeenCalledWith({ status: "denied" });
});

it.each(["close", "hidden", "offline", "popstate", "locale"])("the composed viewer detaches playback across %s without replay", async (reason) => {
  world.hls.supported = true;
  const gate = deferred<undefined>();
  const props = { open: true, locale: "en" as const, ...selection, actorId: actor.id, onClose: vi.fn(), onInvalidate: vi.fn() };
  const view = render(<SourceListing {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
  await waitFor(() => expect(world.hls.instances.length).toBe(1));
  const player = required(world.hls.instances[0]);
  const video = required(view.container.querySelector("video"));
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(gate.promise);
  fireEvent.loadedMetadata(video);
  act(() => player.emit("hlsManifestParsed"));
  if (reason === "close") fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  if (reason === "hidden") {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
  }
  if (reason === "offline") {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
  }
  if (reason === "popstate") fireEvent(window, new Event("popstate"));
  if (reason === "locale") view.rerender(<SourceListing {...props} locale="ru" />);
  await act(async () => gate.resolve(undefined));
  expect(player.destroyed).toBe(true);
  expect(player.handlers.size).toBe(0);
  expect(video.getAttribute("src")).toBeNull();
  expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toContain(video);
  act(() => { player.late("hlsManifestParsed"); player.late("hlsError", true); });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(world.seen.filter(({ method }) => method === "POST")).toHaveLength(1);
});

it.each(["hidden", "offline"])("restores same-generation playback position after composed %s recovery and explicit Play", async (reason) => {
  world.hls.supported = true;
  const view = render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
  await waitFor(() => expect(world.hls.instances).toHaveLength(1));
  const first = required(view.container.querySelector("video"));
  fireEvent.loadedMetadata(first);
  act(() => required(world.hls.instances[0]).emit("hlsManifestParsed"));
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
  first.currentTime = 37;
  let restore = () => {};
  if (reason === "hidden") {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    restore = () => hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
  } else {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    restore = () => online.mockReturnValue(true);
    fireEvent(window, new Event("offline"));
  }
  expect(required(world.hls.instances[0]).destroyed).toBe(true);
  expect(first.getAttribute("src")).toBeNull();
  expect(screen.queryByText("Public car")).toBeNull();
  restore();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Public car");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
  await waitFor(() => expect(world.hls.instances).toHaveLength(2));
  const resumed = required(view.container.querySelector("video"));
  fireEvent.loadedMetadata(resumed);
  act(() => required(world.hls.instances[1]).emit("hlsManifestParsed"));
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  expect(resumed.currentTime).toBe(37);
});

it.each([
  ["ru", "Объявление 1270", "Toyota Prius · 2020", "Цена", "20\u00a0000 USD", "Местоположение", "Ахал · Ашхабад", "Опубликовано", "15.11.2026, 05:00 UTC+5", "Пробег", "0 км", "Расшифровка VIN", "Не указано"],
  ["tk", "Bildiriş 1270", "Toyota Prius · 2020", "Baha", "20,000 USD", "Ýerleşýän ýeri", "Ahal · Aşgabat", "Çap edildi", "15/11/2026, 05:00 UTC+5", "Ýörişi", "0 km", "VIN maglumatlary", "Görkezilmedik"],
] as const)("renders current catalog, money, date and absent decoder meaning in %s", async (locale, title, carTitle, priceLabel, price, locationLabel, location, published, date, mileage, distance, decoder, absent) => {
  Object.assign(world.listing, { priceAmount: 20000, priceCurrency: "USD", displayPriceTmt: 70000, mileageKm: 0 });
  world.before = async (path) => {
    if (!path.includes("/catalog/")) return undefined;
    const family = path.split("/").at(-1);
    const name = family === "brands" ? "Toyota" : family === "models" ? "Prius"
      : family === "regions" ? locale === "ru" ? "Ахал" : "Ahal" : locale === "ru" ? "Ашхабад" : "Aşgabat";
    return Response.json({ items: [{ id: source, name, slug: "fixture", ...(family === "models" ? { brandId: source }
      : family === "cities" ? { regionId: source } : {}) }], hasMore: false, nextCursor: null });
  };
  render(<SourceListing open locale={locale} {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  await screen.findByRole("dialog", { name: title });
  expect(screen.getByRole("heading", { name: carTitle })).toBeTruthy();
  for (const [label, value] of [[priceLabel, price], [locationLabel, location], [published, date], [mileage, distance], [decoder, absent]] as const) {
    expect(screen.getByText(label).nextElementSibling?.textContent).toBe(value);
  }
});

it.each(["success", "failure"])("keeps the newer locale's facts across a delayed old %s", async (outcome) => {
  const gate = deferred<undefined>();
  let reached = false;
  world.before = async (path) => {
    if (path === `/api/v1/listings/${source}` && !reached) {
      reached = true;
      const old = structuredClone(world.listing);
      await gate.promise;
      return outcome === "success" ? Response.json(old) : Response.json({}, { status: 503 });
    }
    return undefined;
  };
  const props = { open: true, locale: "en" as const, ...selection, actorId: actor.id, onClose: vi.fn(), onInvalidate: vi.fn() };
  const view = render(<SourceListing {...props} />);
  await waitFor(() => expect(reached).toBe(true));
  world.listing.description = "Новый текст для текущего обращения";
  view.rerender(<SourceListing {...props} locale="ru" />);
  await screen.findByText("Новый текст для текущего обращения");
  await act(async () => gate.resolve(undefined));
  expect(screen.getByText("Новый текст для текущего обращения")).toBeTruthy();
  expect(screen.queryByText("Public car")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["source", "assignment", "session"])("refuses detail when current %s authority changes during the public read", async (lost) => {
  const gate = deferred<undefined>();
  let reached = false;
  const onInvalidate = vi.fn();
  world.before = async (path) => {
    if (path === `/api/v1/listings/${source}` && !reached) { reached = true; await gate.promise; }
    if (lost === "session" && reached && path.includes("/vehicle-history/")) return Response.json({}, { status: 401 });
    return undefined;
  };
  render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={onInvalidate} />);
  await waitFor(() => expect(reached).toBe(true));
  if (lost === "source") world.selected.sourceListingId = actor.id;
  if (lost === "assignment") world.selected.assignmentVersion = 2;
  await act(async () => gate.resolve(undefined));
  await screen.findByRole("alert");
  expect(onInvalidate).toHaveBeenCalled();
  expect(screen.queryByText("Public car")).toBeNull();
  expect(document.querySelector("img")).toBeNull();
});

it("shows honest missing catalog names and keeps archived public facts when video is unavailable", async () => {
  world.listing.status = "archived";
  world.listing.colorId = actor.id;
  world.before = async (path) => path.includes("/video-access/") ? Response.json({}, { status: 404 }) : undefined;
  render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  await screen.findByText("Public car");
  expect(screen.getByText("Location").nextElementSibling?.textContent).toBe("Name unavailable · Name unavailable");
  expect(screen.getByText("Color").nextElementSibling?.textContent).toBe("Name unavailable");
  expect(screen.getByText("Status").nextElementSibling?.textContent).toBe("Archived");
  expect(await screen.findByText("Video cover could not load.")).toBeTruthy();
  expect(screen.getByText("Public car")).toBeTruthy();
  expect(screen.queryByText(actor.id)).toBeNull();
});

it.each([
  ["en", "Loading Listing…", "This Listing is no longer available.", "This enquiry has no source Listing.", "Retry", "Listing 1270"],
  ["ru", "Загрузка объявления…", "Это объявление больше недоступно.", "У этого обращения нет исходного объявления.", "Повторить", "Объявление 1270"],
  ["tk", "Bildiriş ýüklenýär…", "Bu bildiriş indi elýeterli däl.", "Bu ýüz tutmanyň çeşme bildirişi ýok.", "Gaýtadan synanyş", "Bildiriş 1270"],
] as const)("localizes loading, unavailable source, absence and long text recovery in %s", async (locale, loading, missing, absent, retry, title) => {
  const gate = deferred<undefined>();
  world.before = async (path) => {
    if (path === `/api/v1/listings/${source}`) { await gate.promise; return Response.json({}, { status: 404 }); }
    return undefined;
  };
  render(<SourceListing open locale={locale} {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toBe(loading);
  await act(async () => gate.resolve(undefined));
  expect(await screen.findByText(missing)).toBeTruthy();
  world.before = async (path) => path.includes("/operator/requests/") ? Response.json({ ...world.selected, sourceListingId: null }) : undefined;
  fireEvent.click(screen.getByRole("button", { name: retry }));
  expect(await screen.findByText(absent)).toBeTruthy();
  world.listing.description = "<script>fictional</script> " + "Uzak tekst Длинный текст ".repeat(50);
  world.listing.media = [];
  world.cover = { status: "none" };
  world.before = async () => undefined;
  fireEvent.click(screen.getByRole("button", { name: retry }));
  await screen.findByRole("dialog", { name: title });
  expect(screen.getByText(world.listing.description, { normalizer: (text) => text })).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(document.querySelector("video")).toBeNull();
  expect(document.querySelector("img")).toBeNull();
});

it.each([
  ["validation", "The Listing request is invalid. Close it and refresh the enquiry."],
  ["stale", "Your session changed. Close the Listing and refresh the enquiry."],
] as const)("surfaces %s without any public Listing read", async (state, message) => {
  render(<SourceListing open locale="en" {...selection} {...(state === "validation" ? { id: "invalid" } : { scope: "a".repeat(64) })}
    actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  expect(await screen.findByText(message)).toBeTruthy();
  expect(world.seen.some(({ path }) => path.includes("/listings/"))).toBe(false);
});

it("keeps an explicit recovery attempt current when an earlier offline read finishes late", async () => {
  const gate = deferred<undefined>();
  let reached = false;
  world.before = async (path) => {
    if (path === `/api/v1/listings/${source}` && !reached) {
      reached = true;
      const previous = structuredClone(world.listing);
      await gate.promise;
      return Response.json(previous);
    }
    return undefined;
  };
  render(<SourceListing open locale="en" {...selection} actorId={actor.id} onClose={vi.fn()} onInvalidate={vi.fn()} />);
  await waitFor(() => expect(reached).toBe(true));
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  expect(screen.getByText("You are offline. Reconnect, then retry.")).toBeTruthy();
  online.mockReturnValue(true);
  world.listing.description = "Current facts after recovery";
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Current facts after recovery");
  await act(async () => gate.resolve(undefined));
  expect(screen.getByText("Current facts after recovery")).toBeTruthy();
  expect(screen.queryByText("Public car")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});
