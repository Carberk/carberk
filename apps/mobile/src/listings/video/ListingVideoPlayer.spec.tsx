import { http, HttpResponse } from "msw";
import { AppState } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { act, fireEvent, renderMobile } from "../../../test/render";
import type { FakeVideoPlayer } from "../../../test/native-video";

import { ListingVideoPlayer } from "./ListingVideoPlayer";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "22222222-2222-4222-8222-222222222222";
const GENERATION_ID = "33333333-3333-4333-8333-333333333333";
const MASTER = "http://localhost:3006/files/master.m3u8?grant=tok";
const V360 = "http://localhost:3006/files/360.m3u8?grant=tok";
const V720 = "http://localhost:3006/files/720.m3u8?grant=tok";
const PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360",
  V360,
  "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720",
  V720,
].join("\n");

function readyBody(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    video: {
      id: VIDEO_ID,
      generationId: GENERATION_ID,
      durationMs: 42_000,
      cover: {
        thumbnail: "http://localhost:3006/cover/thumb.webp",
        list: "http://localhost:3006/cover/list.webp",
        detail: "http://localhost:3006/cover/detail.webp",
        fullscreen: "http://localhost:3006/cover/full.webp",
      },
    },
    expiresAt: "2030-01-01T00:05:00.000Z",
    url: MASTER,
    qualities: [360, 720],
    ...overrides,
  };
}

function servePlayback(body: () => unknown, status = 200) {
  server.use(
    http.post("*/listings/video-access/viewer/listing/:id/playback", () =>
      HttpResponse.json(body() as Record<string, unknown>, { status }),
    ),
    http.get("*/files/master.m3u8", () => new HttpResponse(PLAYLIST, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl" },
    })),
  );
}

async function renderPlayer(onClose = vi.fn()) {
  const screen = await renderMobile(
    <ListingVideoPlayer audience="viewer" type="listing" id={LISTING_ID} onClose={onClose} />,
  );
  return { screen, onClose };
}

function playerOf(screen: Awaited<ReturnType<typeof renderPlayer>>["screen"]) {
  return screen.getByTestId("listing-video-player-view").props.player as FakeVideoPlayer;
}

async function startPlaying(screen: Awaited<ReturnType<typeof renderPlayer>>["screen"]) {
  const player = playerOf(screen);
  await act(async () => { player.emitStatus("readyToPlay"); });
  return player;
}

beforeEach(() => {
  servePlayback(() => readyBody());
});

describe("ListingVideoPlayer", () => {
  it("shows Loading video until the first frame is ready, then starts playing with sound", async () => {
    const { screen } = await renderPlayer();
    expect(await screen.findByText("Loading video")).toBeTruthy();

    const player = await startPlaying(screen);
    expect(player.playing).toBe(true);
    expect(player.muted).toBe(false);
    expect(screen.queryByText("Loading video")).toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByText("0:42")).toBeTruthy();
  });

  it("pauses and resumes from the control bar", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);

    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(player.playing).toBe(false);
    expect(screen.getByTestId("listing-video-player-play-pause").props.accessibilityLabel).toBe("Play");

    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(player.playing).toBe(true);
  });

  it("stays paused when the player reports ready again after a pause", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);

    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(player.playing).toBe(false);

    await act(async () => { player.emitStatus("readyToPlay"); });
    expect(player.playing).toBe(false);
    expect(screen.getByTestId("listing-video-player-play-pause").props.accessibilityLabel).toBe("Play");
  });

  it("seeks with the scrub bar and follows time updates", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);

    await act(async () => { player.emitTimeUpdate(7); });
    expect(screen.getByText("0:07")).toBeTruthy();

    const seek = screen.getByTestId("listing-video-player-seek");
    await fireEvent(seek, "layout", { nativeEvent: { layout: { width: 200 } } });
    await fireEvent(seek, "press", { nativeEvent: { locationX: 100 } });
    expect(player.currentTime).toBe(21);
  });

  it("toggles in-app full screen and back, keeping the controls reachable", async () => {
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Full screen" }));
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Exit full screen" }));
    expect(screen.getByRole("button", { name: "Full screen" })).toBeTruthy();
  });

  it("mutes and unmutes", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Mute" }));
    expect(player.muted).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Unmute" }));
    expect(player.muted).toBe(false);
  });

  it("shows Buffering when playback stalls after starting", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);

    await act(async () => { player.emitStatus("loading"); });
    expect(screen.getByText("Buffering")).toBeTruthy();

    await act(async () => { player.emitStatus("readyToPlay"); });
    expect(screen.queryByText("Buffering")).toBeNull();
  });

  it("lists only this video's qualities and loads the chosen rendition", async () => {
    const { screen } = await renderPlayer();
    await startPlaying(screen);
    // Let the master playlist fetch land so variant URLs are known.
    await act(async () => {});

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    expect(screen.getByRole("button", { name: "Auto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Data saver · up to 360p" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "720p" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "360p" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "240p" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "720p" }));
    const next = playerOf(screen);
    expect((next.source as { uri: string }).uri).toBe(V720);
  });

  it("caps Data saver at 360p", async () => {
    const { screen } = await renderPlayer();
    await startPlaying(screen);
    await act(async () => {});

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    await fireEvent.press(screen.getByRole("button", { name: "Data saver · up to 360p" }));
    expect((playerOf(screen).source as { uri: string }).uri).toBe(V360);
  });

  it("shows Couldn't play the video with Try again when playback fails, and recovers", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);

    await act(async () => { player.emitStatus("error"); });
    expect(screen.getByText("Couldn't play the video")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    const retried = playerOf(screen);
    await act(async () => { retried.emitStatus("readyToPlay"); });
    expect(retried.playing).toBe(true);
    expect(screen.queryByText("Couldn't play the video")).toBeNull();
  });

  it("keeps playing at the same position after a quality switch", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(10); });
    await act(async () => {});

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    await fireEvent.press(screen.getByRole("button", { name: "720p" }));

    expect((player.source as { uri: string }).uri).toBe(V720);
    expect(player.currentTime).toBe(10);
    expect(player.playing).toBe(true);
  });

  it("renews an expired grant when Play is tapped after the video ends", async () => {
    let posts = 0;
    servePlayback(() => { posts += 1; return readyBody({ expiresAt: "2000-01-01T00:05:00.000Z" }); });
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    expect(posts).toBe(1);

    await act(async () => { player.emitPlayToEnd(); });
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(posts).toBe(2);
  });

  it("shows Video unavailable without Try again when playback is refused", async () => {
    servePlayback(() => ({ code: "VIDEO_NOT_AVAILABLE", message: "Video unavailable" }), 404);
    const { screen } = await renderPlayer();

    expect(await screen.findByText("Video unavailable")).toBeTruthy();
    expect(screen.getByText("This listing's video can't be played any more.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows Couldn't play the video when the grant request fails", async () => {
    servePlayback(() => ({ code: "INTERNAL", message: "boom" }), 500);
    const { screen } = await renderPlayer();

    expect(await screen.findByText("Couldn't play the video")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("pauses and calls onClose when closed", async () => {
    const { screen, onClose } = await renderPlayer();
    const player = await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Close video" }));
    expect(player.playing).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops playback when the app goes to the background", async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = vi.spyOn(AppState, "addEventListener").mockImplementation(((_event: string, cb: (state: string) => void) => {
      listeners.push(cb);
      return { remove: () => {} };
    }) as never);
    try {
      const { screen } = await renderPlayer();
      const player = await startPlaying(screen);
      expect(player.playing).toBe(true);

      await act(async () => { listeners.forEach((cb) => cb("background")); });
      expect(player.playing).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("releases playback when unmounted", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    expect(player.playing).toBe(true);

    await act(async () => { screen.unmount(); });
    expect(player.playing).toBe(false);
  });
});
