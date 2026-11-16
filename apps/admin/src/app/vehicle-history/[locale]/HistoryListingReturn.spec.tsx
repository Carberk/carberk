// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const { token } = await import("./testing/source-listing-platform");
  return { headers: async () => new Headers(), cookies: async () => ({
    get: (name: string) => name === "auto_tm_admin_access" ? { value: token } : undefined,
  }) };
});
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {},
  usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));

import { HistoryInbox } from "./HistoryInbox";
import { actor, id, source, sourceListingPlatform } from "./testing/source-listing-platform";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";

let world: ReturnType<typeof sourceListingPlatform>;
const message = { id, clientMessageId: id, order: "1", kind: "TEXT", text: "Keep my enquiry",
  author: { ...actor, kind: "requester" }, createdAt: "2026-11-15T00:00:00.000Z" };
const query = `filter=mine&search=Merdan&cursor=${id}&selected=${id}&v=1`;
function view(locale: "en" | "ru" | "tk" = "en") {
  return <HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>;
}
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", `/vehicle-history/en?${query}`);
  world = sourceListingPlatform();
  const row = Object.fromEntries(Object.entries(world.selected).filter(([name]) => name !== "sourceListingId"));
  world.before = async (path) => path.endsWith("/requests")
    ? Response.json({ items: [row], nextCursor: id })
    : path.endsWith("/messages") ? Response.json({ items: [message], nextCursor: null }) : undefined;
  const network = fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    return url.pathname.endsWith("/messages") && url.searchParams.has("cursor")
      ? Promise.resolve(Response.json({ items: [], nextCursor: null })) : network(input, init);
  });
});
afterEach(async () => {
  cleanup();
  await vi.dynamicImportSettled();
  await new Promise<void>((resolve) => setImmediate(resolve));
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.doUnmock("hls.js");
});

it("opens the real request-derived public Listing without replacing the enquiry or its return context", async () => {
  render(view());
  await screen.findByText("Keep my enquiry");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  pane.scrollTop = 37;
  fireEvent.scroll(pane);
  const open = screen.getByRole("button", { name: "View full listing" }); open.focus();
  fireEvent.click(open);
  await screen.findByRole("dialog", { name: "Listing 1270" });
  expect(screen.getByText("Public car")).toBeTruthy();
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
  expect(window.location.search).toBe(`?${query}&source=listing`);
  expect(within(screen.getByRole("dialog")).getByRole("link", { name: "RU" }).getAttribute("href"))
    .toBe(`/vehicle-history/ru?${query}&source=listing`);
  expect(world.seen.find(({ path }) => path === `/api/v1/listings/${source}`)?.auth).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.location.search).toBe(`?${query}`);
  expect(screen.getByRole("list", { name: "Enquiry conversation" })).toBe(pane);
  expect(pane.scrollTop).toBe(37);
  await waitFor(() => expect(document.activeElement).toBe(open));
});

it("follows Back and Forward without adding another history entry or replacing the conversation", async () => {
  render(view()); await screen.findByText("Keep my enquiry");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await screen.findByText("Public car");
  await act(async () => window.history.back());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.location.search).toBe(`?${query}`);
  await act(async () => window.history.forward());
  await screen.findByText("Public car");
  expect(window.location.search).toBe(`?${query}&source=listing`);
  expect(screen.getByRole("list", { name: "Enquiry conversation" })).toBe(pane);
});

it("preserves unsent search text while viewing and closes a refreshed URL locally despite a hostile return target", async () => {
  window.history.replaceState(null, "", `/vehicle-history/en?${query}&source=listing&returnTo=https://foreign.test&listingId=${actor.id}`);
  render(view()); await screen.findByText("Public car");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Search still being typed" } });
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.location.pathname).toBe("/vehicle-history/en");
  expect(window.location.search).toBe(`?${query}`);
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("Search still being typed");
  expect(world.seen.some(({ path }) => path === `/api/v1/listings/${actor.id}`)).toBe(false);
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
});

it.each([404, 403, 503])("keeps the enquiry available when the public Listing returns HTTP %s", async (status) => {
  const boundary = world.before;
  world.before = (path, method) => path === `/api/v1/listings/${source}`
    ? Promise.resolve(Response.json({}, { status })) : boundary(path, method);
  render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await within(screen.getByRole("dialog")).findByRole("alert");
  expect(screen.queryByText("Public car")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
});

it("has no Listing action for an enquiry without a source", async () => {
  Object.assign(world.selected, { sourceListingId: null });
  render(view()); await screen.findByText("Keep my enquiry");
  expect(screen.getByText("No source Listing")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "View full listing" })).toBeNull();
  expect(world.seen.some(({ path }) => path.startsWith("/api/v1/listings/"))).toBe(false);
});

it.each(["draft", "pending_review", "rejected"])("does not display a %s Listing even when a legacy public reader returns it", async (status) => {
  Object.assign(world.listing, { status, description: "Private draft description" });
  render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await within(screen.getByRole("dialog")).findByRole("alert");
  expect(screen.queryByText("Private draft description")).toBeNull();
  expect(screen.queryByAltText("Photo 1 of 3")).toBeNull();
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
});

it.each(["ru", "tk"] as const)("reopens the current source after a refresh or language change to %s", async (locale) => {
  render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await screen.findByText("Public car");
  const target = within(screen.getByRole("dialog")).getByRole("link", { name: locale.toUpperCase() }).getAttribute("href");
  cleanup();
  window.history.replaceState(null, "", target);
  render(view(locale));
  await screen.findByText("Public car");
  fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Закрыть объявление" : "Bildirişi ýap" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.location.pathname).toBe(`/vehicle-history/${locale}`);
  expect(window.location.search).toBe(`?${query}`);
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
});

it("restores the conversation anchor and queue position across a real component reload", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const pane = this.closest("ol");
    const top = this.tagName === "OL" ? 100 : pane ? 100 - pane.scrollTop : 0;
    return { top, bottom: top + 500, height: 500, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) };
  });
  const mounted = render(view()); await screen.findByText("Keep my enquiry");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  const queue = document.getElementById("history-queue");
  if (!queue) throw new Error("Missing queue");
  queue.scrollTop = 14;
  pane.scrollTop = 137; fireEvent.scroll(pane);
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await screen.findByText("Public car");
  mounted.unmount(); render(view());
  await screen.findByText("Public car");
  expect(screen.getByRole("list", { name: "Enquiry conversation" }).scrollTop).toBe(137);
  expect(document.getElementById("history-queue")?.scrollTop).toBe(14);
});

it("reloads authorized forward pages before restoring a saved message anchor", async () => {
  const network = fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/messages")) return network(input, init);
    return Promise.resolve(Response.json(url.searchParams.has("cursor")
      ? { items: [{ ...message, id: source, clientMessageId: source, order: "2", text: "Later page" }], nextCursor: null }
      : { items: [message], nextCursor: id }));
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const pane = this.closest("ol"), later = this.id.endsWith(source);
    const top = this.tagName === "OL" ? 100 : pane ? 100 + (later ? 400 : 0) - pane.scrollTop : 0;
    return { top, bottom: top + (later ? 500 : 80), height: 80, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) };
  });
  const mounted = render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "More messages" }));
  await screen.findByText("Later page");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  pane.scrollTop = 450; fireEvent.scroll(pane);
  mounted.unmount(); render(view());
  await screen.findByText("Later page");
  expect(screen.getByRole("list", { name: "Enquiry conversation" }).scrollTop).toBe(450);
});

it("replaces an observed changed source with the current request-derived Listing", async () => {
  render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await screen.findByText("Public car");
  Object.assign(world.selected, { sourceListingId: actor.id });
  Object.assign(world.listing, { id: actor.id, description: "Changed source car" });
  const network = world.before;
  world.before = (path, method) => path === `/api/v1/listings/${actor.id}`
    ? Promise.resolve(Response.json(world.listing)) : network(path, method);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Changed source car");
  expect(screen.queryByText("Public car")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
});

it("removes both Listing and protected enquiry content when current History authority is refused", async () => {
  render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await screen.findByText("Public car");
  const network = world.before;
  world.before = (path, method) => path.endsWith("/desk")
    ? Promise.resolve(Response.json({}, { status: 403 })) : network(path, method);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Access denied");
  expect(screen.queryByText("Keep my enquiry")).toBeNull();
  expect(screen.queryByText("Public car")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("returns focus to the enquiry when its source is removed while viewing", async () => {
  render(view()); await screen.findByText("Keep my enquiry");
  fireEvent.click(screen.getByRole("button", { name: "View full listing" }));
  await screen.findByText("Public car");
  Object.assign(world.selected, { sourceListingId: null });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await within(screen.getByRole("dialog")).findByText("This enquiry has no source Listing.");
  fireEvent.click(screen.getByRole("button", { name: "Close listing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Keep my enquiry")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "View full listing" })).toBeNull();
  expect(document.activeElement?.id).toBe("selected-enquiry");
});
