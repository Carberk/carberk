import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, act } from "../../../test/render";
import { server } from "../../../test/msw";

import { VideoPlaybackModal } from "./VideoPlaybackModal";

const native = vi.hoisted(() => ({ sources: [] as unknown[], play: vi.fn(), pause: vi.fn(), listeners: new Map<string, (event: never) => void>() }));
vi.mock("expo-video", async () => ({ VideoView: (await import("react-native")).View, useVideoPlayer: (_source: unknown, configure: (player: unknown) => void) => {
 const player = { muted: false, loop: false, currentTime: 0, timeUpdateEventInterval: 0, play: native.play, pause: native.pause, replaceAsync: async (source: unknown) => { native.sources.push(source); }, addListener: (name: string, listener: (event: never) => void) => { native.listeners.set(name, listener); return { remove() {} }; } };
 configure(player); return player;
} }));
const listingId = "00000000-0000-4000-8000-000000000041", generationId = "00000000-0000-4000-8000-000000000042";
beforeEach(() => { native.sources = []; native.play.mockClear(); native.pause.mockClear(); native.listeners.clear();
 server.use(http.post(`http://localhost:3006/api/v1/listings/${listingId}/video-grants`, () => HttpResponse.json({ url: `/video-grants/${"s".repeat(43)}/master.m3u8`, generationId, expiresAt: "2099-01-01T00:00:00Z" }, { status: 201 })));
});
describe("intentional native video playback", () => {
 it("begins conservatively with sound and offers only available rendition choices", async () => {
  const screen = await renderMobile(<VideoPlaybackModal listingId={listingId} generationId={generationId} renditions={[240, 360]} onClose={() => {}} />);
  await vi.waitFor(() => expect(native.play).toHaveBeenCalled());
  expect(native.sources).toContainEqual(expect.objectContaining({ uri: expect.stringContaining("/240/index.m3u8"), contentType: "hls" }));
  expect(screen.getByRole("button", { name: "360p" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "720p" })).toBeNull();
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "360p" })); });
  expect(native.sources).toContainEqual(expect.objectContaining({ uri: expect.stringContaining("/360/index.m3u8") }));
 });
 it("stops the native source before closing", async () => {
  const onClose = vi.fn();
  const screen = await renderMobile(<VideoPlaybackModal listingId={listingId} generationId={generationId} renditions={[240]} onClose={onClose} />);
  await vi.waitFor(() => expect(native.play).toHaveBeenCalled());
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Close video" })); });
  expect(native.pause).toHaveBeenCalled(); expect(native.sources.at(-1)).toBeNull(); expect(onClose).toHaveBeenCalledOnce();
 });
});
