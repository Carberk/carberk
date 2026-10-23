import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";

import { renderMobile, fireEvent, routerMock, act } from "../../../test/render";
import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";

import { ListingPhotoStrip } from "./ListingPhotoStrip";

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { secure.set(key, value); }, deleteItemAsync: async (key: string) => { secure.delete(key); } }));
it("opens detail with the ready video selected without starting playback", async () => {
 const listingId = "00000000-0000-4000-8000-000000000061", generationId = "00000000-0000-4000-8000-000000000062";
 await storeAuthSession({ accessToken: "synthetic", refreshToken: "synthetic-refresh", user: { id: listingId, phone: null, email: null, displayName: null, role: "buyer" } });
 let playback = 0;
 server.use(
  http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })),
  http.get(`http://localhost:3006/api/v1/listings/${listingId}/video`, () => HttpResponse.json({ generationId, durationMs: 5000, renditions: [240] })),
  http.post(`http://localhost:3006/api/v1/listings/${listingId}/video-grants`, async ({ request }) => { if ((await request.json() as { purpose: string }).purpose === "playback") playback++; return HttpResponse.json({ url: `/video-grants/${"p".repeat(43)}/poster.jpg`, generationId, expiresAt: "2099-01-01T00:00:00Z" }, { status: 201 }); }),
 );
 const screen = await renderMobile(<ListingPhotoStrip listingId={listingId} photoKeys={["cover/original.webp", "second/original.webp"]} photoCount={2} onOpen={() => {}} />);
 await act(async () => { fireEvent.press(await screen.findByRole("button", { name: "Play video, 5 seconds" })); });
 expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(public)/listings/[id]", params: { id: listingId, video: generationId } });
 expect(playback).toBe(0);
});
