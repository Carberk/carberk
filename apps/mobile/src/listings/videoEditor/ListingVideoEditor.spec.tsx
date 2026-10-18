import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as ImagePicker from "expo-image-picker";

import { renderMobile, fireEvent, act } from "../../../test/render";
import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";

import { ListingVideoEditor } from "./ListingVideoEditor";

const secure = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({ getItemAsync: async (key: string) => secure.get(key) ?? null, setItemAsync: async (key: string, value: string) => { secure.set(key, value); }, deleteItemAsync: async (key: string) => { secure.delete(key); } }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("expo-video", async () => {
 const { View } = await import("react-native");
 const player = { loop: false, muted: false, currentTime: 0, timeUpdateEventInterval: 0, play() {}, pause() {}, addListener: () => ({ remove() {} }), generateThumbnailsAsync: async () => [] };
 return { VideoView: View, useVideoPlayer: (_source: unknown, setup: (value: typeof player) => void) => { setup?.(player); return player; } };
});
const ownerId = "00000000-0000-4000-8000-000000000020", target = { kind: "draft" as const, id: "00000000-0000-4000-8000-000000000021" };
beforeEach(async () => {
 secure.clear();
 vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
 await storeAuthSession({ accessToken: "synthetic", refreshToken: "synthetic-refresh", user: { id: ownerId, phone: null, email: null, displayName: null, role: "buyer" } });
});
describe("optional video editor current capabilities", () => {
 it("shows library selection only when the current server admits uploading", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })));
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  expect(await screen.findByRole("button", { name: "Add video" })).toBeTruthy();
 });
 it("keeps video selection unavailable to an ineligible account", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: false, canView: false })));
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  expect(screen.queryByRole("button", { name: "Add video" })).toBeNull();
 });
 it("requires an explicit interval for long clips and renders two accessible trim handles", async () => {
  server.use(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: true, canView: true })));
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///library/selected.mov", width: 960, height: 540, duration: 120000, type: "video" }] });
  const screen = await renderMobile(<ListingVideoEditor ownerId={ownerId} target={target} />);
  await act(async () => { fireEvent.press(await screen.findByRole("button", { name: "Add video" })); });
  expect(screen.getByRole("adjustable", { name: "Video start" })).toBeTruthy();
  expect(screen.getByRole("adjustable", { name: "Video end" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use video" }).props.accessibilityState?.disabled).toBe(true);
  await act(() => { fireEvent(screen.getByRole("adjustable", { name: "Video start" }), "accessibilityAction", { nativeEvent: { actionName: "increment" } }); });
  expect(screen.getByRole("button", { name: "Use video" }).props.accessibilityState?.disabled).toBe(false);
 });

});
