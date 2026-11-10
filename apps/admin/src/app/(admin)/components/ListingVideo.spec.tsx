// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getListingVideo } from "../actions";

import { ListingVideo } from "./ListingVideo";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => ({ value: "server-only-access" }) }) }));
const metadata = { status: "ready", video: { id: "11111111-1111-4111-8111-111111111111", generationId: "22222222-2222-4222-8222-222222222222", durationMs: 45000, cover: { thumbnail: "https://api.example/thumbnail.webp?grant=cover", list: "https://api.example/list.webp?grant=cover", detail: "https://api.example/detail.webp?grant=cover", fullscreen: "https://api.example/fullscreen.webp?grant=cover" } } };
const requests: { url: string; method: string }[] = [];
let unavailable = false;
beforeEach(() => {
  requests.length = 0; unavailable = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? "GET" });
    if (unavailable) return Response.json({ code: "VIDEO_NOT_AVAILABLE", message: "Video unavailable" }, { status: 404 });
    return Response.json({ ...metadata, ...(init?.method === "POST" ? { url: "https://api.example/master.m3u8?grant=playback" } : {}) });
  }));
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) { this.currentTime = 0; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("moderator video", () => {
  it("shows status, cover and duration, and requests playback only on Play", async () => {
    const result = await getListingVideo("listing");
    const view = render(<ListingVideo listingId="listing" result={result} />);
    expect(screen.getByText("Готово")).toBeTruthy(); expect(screen.getByText("Длительность: 0:45")).toBeTruthy();
    expect(screen.getByAltText("Обложка видео объявления").getAttribute("src")).toContain("grant=cover");
    const player = view.container.querySelector("video") as HTMLVideoElement;
    expect(player.getAttribute("src")).toBeNull(); expect(requests.map((r) => r.method)).toEqual(["GET"]);
    fireEvent.click(screen.getByRole("button", { name: "Смотреть видео" }));
    await waitFor(() => expect(player.src).toContain("master.m3u8?grant=playback"));
    expect(requests.map((r) => r.method)).toEqual(["GET", "POST"]);
    fireEvent.loadedMetadata(player);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Закрыть видео" }));
    expect(player.getAttribute("src")).toBeNull(); expect(screen.getByRole("button", { name: "Смотреть видео" })).toBeTruthy();
  });
  it("renews through Retry and restores position after a media grant expires", async () => {
    const view = render(<ListingVideo listingId="listing" result={await getListingVideo("listing")} />);
    const player = view.container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(player, "readyState", { get: () => player.getAttribute("src") ? 4 : 0 });
    fireEvent.click(screen.getByRole("button", { name: "Смотреть видео" }));
    await waitFor(() => expect(player.src).toContain("master.m3u8"));
    fireEvent.loadedMetadata(player); player.currentTime = 3;
    fireEvent.error(player);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    await waitFor(() => expect(player.src).toContain("master.m3u8"));
    fireEvent.loadedMetadata(player);
    expect(player.currentTime).toBe(3);
  });
  it("offers authenticated retry after a refusal and keeps processing/empty states explicit", async () => {
    const view = render(<ListingVideo listingId="listing" result={await getListingVideo("listing")} />);
    unavailable = true; fireEvent.click(screen.getByRole("button", { name: "Смотреть видео" }));
    await screen.findByRole("alert");
    unavailable = false; fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    await waitFor(() => expect(view.container.querySelector("video")?.src).toContain("master.m3u8"));
    view.rerender(<ListingVideo key="empty" listingId="empty" result={{ ok: true, data: { status: "none" } }} />);
    expect(screen.getByText("Видео не добавлено")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
    view.rerender(<ListingVideo key="processing" listingId="pending" result={{ ok: true, data: { status: "processing" } }} />);
    expect(screen.getByText("Обрабатывается")).toBeTruthy();
  });
});
