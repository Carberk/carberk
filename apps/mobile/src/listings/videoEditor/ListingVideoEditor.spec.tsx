import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ImagePicker from "expo-image-picker";

import { renderMobile, fireEvent, act } from "../../../test/render";
import { server } from "../../../test/msw";
import { videoNativeStorage } from "../videoTransfer/testing/InMemoryVideoNativeStorage";
import { storeAuthSession } from "../../auth/session";

import { ListingVideoEditor } from "./ListingVideoEditor";

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { secure.set(key, value); }, deleteItemAsync: async (key: string) => { secure.delete(key); } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async (key: string) => videoNativeStorage.values.get(key) ?? null, setItem: async (key: string, value: string) => { videoNativeStorage.values.set(key, value); }, removeItem: async (key: string) => { videoNativeStorage.values.delete(key); } } }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-file-system", async () => ({ File: (await import("../videoTransfer/testing/InMemoryVideoNativeStorage")).VideoNativeFile }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("expo-video", async () => {
 const { View } = await import("react-native");
 const player = { loop: false, muted: false, currentTime: 0, timeUpdateEventInterval: 0, play() {}, pause() {}, addListener: () => ({ remove() {} }), generateThumbnailsAsync: async (times: number[]) => times.map(time => ({ requestedTime: time, width: 160, height: 120, release() {} })) };
 return { VideoView: View, useVideoPlayer: (_source: unknown, setup: (value: typeof player) => void) => { setup?.(player); return player; } };
});
const ownerId = "00000000-0000-4000-8000-000000000020", target = { kind: "draft" as const, id: "00000000-0000-4000-8000-000000000021" };
beforeEach(async () => {
 secure.clear(); videoNativeStorage.values.clear();
 server.use(http.get("http://localhost:3006/api/v1/listing-video-targets/:kind/:id", () => HttpResponse.json({ active: null, pending: null })));
 vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
 await storeAuthSession({ accessToken: "synthetic", refreshToken: "synthetic-refresh", user: { id: ownerId, phone: null, email: null, displayName: null, role: "buyer" } });
});
describe("optional video editor current capabilities", () => {
 it("shows library selection only when the current server admits uploading", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })));
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  expect(await screen.findByRole("button", { name: "Add video" })).toBeTruthy();
 });
 it("lets the seller trim and use a replacement while the active video remains available", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })), http.get("http://localhost:3006/api/v1/listing-video-targets/:kind/:id", () => HttpResponse.json({ active: { generationId: target.id, durationMs: 3000 }, pending: null })));
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///library/replacement.mov", width: 960, height: 540, duration: 3000, type: "video" }] });
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  await screen.findByText(/Current video/);
  await act(async () => { fireEvent.press(await screen.findByRole("button", { name: "Add video" })); });
  expect(await screen.findByRole("adjustable", { name: "Video start" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use video" }).props.accessibilityState?.disabled).toBe(false);
  expect(screen.getByText(/Current video/)).toBeTruthy();
 });
 it("keeps video selection unavailable to an ineligible account", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: false, canView: false })));
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  await vi.waitFor(() => { expect(screen.queryClient.isFetching()).toBe(0); });
  expect(screen.queryByRole("button", { name: "Add video" })).toBeNull();
 });
 it("recovers selection and trim after reopening without asking the picker again", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })));
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///library/retained.mov", width: 960, height: 540, duration: 120000, type: "video" }] });
  const first = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  await act(async () => { fireEvent.press(await first.findByRole("button", { name: "Add video" })); });
  const handle = await first.findByRole("adjustable", { name: "Video start" });
  await act(() => { fireEvent(handle, "accessibilityAction", { nativeEvent: { actionName: "increment" } }); });
  await first.unmount();
  const reopened = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  expect((await reopened.findByRole("adjustable", { name: "Video start" })).props.accessibilityValue.now).toBe(1);
  expect(reopened.getByRole("button", { name: "Use video" }).props.accessibilityState?.disabled).toBe(false);
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
 });
 it("requires an explicit interval for long clips and renders two accessible trim handles", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })));
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///library/selected.mov", width: 960, height: 540, duration: 120000, type: "video" }] });
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  await act(async () => { fireEvent.press(await screen.findByRole("button", { name: "Add video" })); });
  expect(await screen.findByRole("adjustable", { name: "Video start" })).toBeTruthy();
  expect(screen.getByRole("adjustable", { name: "Video end" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use video" }).props.accessibilityState?.disabled).toBe(true);
  await act(() => { fireEvent(screen.getByRole("adjustable", { name: "Video start" }), "accessibilityAction", { nativeEvent: { actionName: "increment" } }); });
  expect(screen.getByRole("button", { name: "Use video" }).props.accessibilityState?.disabled).toBe(false);
 });

 it("shows the public video separately from its replacement and cancels only the replacement", async () => {
  const listing = { kind: "listing" as const, id: "00000000-0000-4000-8000-000000000081" };
  let pending: { sessionId: string; state: string } | null = { sessionId: "00000000-0000-4000-8000-000000000082", state: "PROCESSING" };
  server.use(
   http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })),
   http.get(`http://localhost:3006/api/v1/listing-video-targets/listing/${listing.id}`, () => HttpResponse.json({ active: { generationId: listing.id, durationMs: 5000 }, pending })),
   http.delete(`http://localhost:3006/api/v1/listing-video-targets/listing/${listing.id}/pending`, () => { pending = null; return new HttpResponse(null, { status: 204 }); }),
  );
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={listing} />);
  expect(await screen.findByText("Current video · 5 s")).toBeTruthy();
  expect(screen.getByText("Processing replacement")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel replacement" }));
  await vi.waitFor(() => { expect(screen.queryByText("Processing replacement")).toBeNull(); });
  expect(screen.getByText("Current video · 5 s")).toBeTruthy();
 });
 it("keeps the current video visible when removal is offline and offers retry", async () => {
  const listing = { kind: "listing" as const, id: "00000000-0000-4000-8000-000000000083" };
  let active: { generationId: string; durationMs: number } | null = { generationId: listing.id, durationMs: 5000 }, offline = true;
  server.use(
   http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: false, canView: true })),
   http.get(`http://localhost:3006/api/v1/listing-video-targets/listing/${listing.id}`, () => HttpResponse.json({ active, pending: null })),
   http.delete(`http://localhost:3006/api/v1/listings/${listing.id}/video`, () => { if (offline) return HttpResponse.error(); active = null; return new HttpResponse(null, { status: 204 }); }),
  );
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={listing} />);
  await fireEvent.press(await screen.findByRole("button", { name: "Remove video" }));
  expect(await screen.findByText("Video could not be removed. Try again when connected.")).toBeTruthy();
  expect(screen.getByText("Current video · 5 s")).toBeTruthy();
  offline = false;
  await fireEvent.press(screen.getByRole("button", { name: "Remove video" }));
  await vi.waitFor(() => { expect(screen.queryByText("Current video · 5 s")).toBeNull(); });
 });

});
