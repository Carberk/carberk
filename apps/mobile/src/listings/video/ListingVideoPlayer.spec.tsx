import { http, HttpResponse } from "msw";
import { AppState } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react-native";

import { sentVideoTelemetry, server } from "../../../test/msw";
import { act, fireEvent, renderMobile } from "../../../test/render";
import { createdPlayers, type FakeVideoPlayer } from "../../../test/native-video";

import { ListingVideoPlayer } from "./ListingVideoPlayer";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "22222222-2222-4222-8222-222222222222";
const GENERATION_ID = "33333333-3333-4333-8333-333333333333";
const masterUrl = (grant: string) => `http://localhost:3006/files/master.m3u8?grant=${grant}`;
const variantUrl = (height: number, grant: string) => `http://localhost:3006/files/${height}.m3u8?grant=${grant}`;
const MASTER = masterUrl("tok1");
const V360 = variantUrl(360, "tok1");
const V720 = variantUrl(720, "tok1");

function playlist(grant: string, orientation: "landscape" | "portrait") {
  const res = (w: number, h: number) => (orientation === "landscape" ? `${w}x${h}` : `${h}x${w}`);
  return [
    "#EXTM3U",
    `#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=${res(640, 360)}`,
    variantUrl(360, grant),
    `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=${res(1280, 720)}`,
    variantUrl(720, grant),
  ].join("\n");
}

let posts = 0;

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
    // Each grant carries a new token, so a renewal changes the URL.
    url: masterUrl(`tok${posts}`),
    qualities: [360, 720],
    ...overrides,
  };
}

function servePlayback(
  body: () => unknown,
  status = 200,
  { orientation = "landscape", playlistGate, playlistStatus = 200 }: {
    orientation?: "landscape" | "portrait";
    playlistGate?: Promise<void>;
    playlistStatus?: number;
  } = {},
) {
  server.use(
    http.post("*/listings/video-access/viewer/listing/:id/playback", () => {
      posts += 1;
      return HttpResponse.json(body() as Record<string, unknown>, { status });
    }),
    http.get("*/files/master.m3u8", async ({ request }) => {
      await playlistGate;
      if (playlistStatus !== 200) return new HttpResponse(null, { status: playlistStatus });
      const grant = new URL(request.url).searchParams.get("grant") ?? "";
      return new HttpResponse(playlist(grant, orientation), {
        headers: { "Content-Type": "application/vnd.apple.mpegurl" },
      });
    }),
  );
}

async function renderPlayer(onClose = vi.fn()) {
  const screen = await renderMobile(
    <ListingVideoPlayer audience="viewer" type="listing" id={LISTING_ID} onClose={onClose} />,
  );
  return { screen, onClose };
}

type Screen = Awaited<ReturnType<typeof renderPlayer>>["screen"];

function playerOf(screen: Screen) {
  return screen.getByTestId("listing-video-player-view").props.player as FakeVideoPlayer;
}

function uriOf(player: FakeVideoPlayer) {
  return (player.source as { uri: string } | null)?.uri;
}

async function startPlaying(screen: Screen) {
  // Let the grant and the master playlist land.
  await act(async () => {});
  const player = playerOf(screen);
  await act(async () => { player.emitStatus("readyToPlay"); });
  await act(async () => {});
  return player;
}

async function pickQuality(screen: Screen, name: string) {
  await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
  await fireEvent.press(screen.getByRole("button", { name }));
}

/** Waits for the player built after a grant renewal and reloaded. */
async function nextPlayer(screen: Screen, after: FakeVideoPlayer) {
  await act(async () => {});
  await act(async () => {});
  const player = playerOf(screen);
  expect(player).not.toBe(after);
  return player;
}

function captureAppState() {
  const listeners: ((state: string) => void)[] = [];
  const spy = vi.spyOn(AppState, "addEventListener").mockImplementation(((_event: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: () => {} };
  }) as never);
  return { emit: (state: string) => listeners.forEach((cb) => cb(state)), restore: () => spy.mockRestore() };
}

/** A grant that is valid when it arrives and expires 40 s later. */
const shortGrant = () => readyBody({ expiresAt: new Date(Date.now() + 40_000).toISOString() });

/** Moves the wall clock on without re-rendering anything. */
function advanceClock(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms));
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  posts = 0;
  createdPlayers.length = 0;
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

  it("lists only this video's qualities and loads the chosen rendition on a new player", async () => {
    const { screen } = await renderPlayer();
    const first = await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    expect(screen.getByRole("button", { name: "Auto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Data saver · up to 360p" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "720p" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "360p" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "240p" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "720p" }));
    const next = playerOf(screen);
    expect(next).not.toBe(first);
    expect(uriOf(next)).toBe(V720);
    expect(first.released).toBe(true);
  });

  it("caps Data saver at 360p", async () => {
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await pickQuality(screen, "Data saver · up to 360p");
    expect(uriOf(playerOf(screen))).toBe(V360);
  });

  it("picks portrait renditions by their short side", async () => {
    servePlayback(() => readyBody(), 200, { orientation: "portrait" });
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await pickQuality(screen, "720p");
    expect(uriOf(playerOf(screen))).toBe(V720);
    await pickQuality(screen, "Data saver · up to 360p");
    expect(uriOf(playerOf(screen))).toBe(V360);
  });

  it("offers only Auto until the renditions are known", async () => {
    let open = () => {};
    servePlayback(() => readyBody(), 200, { playlistGate: new Promise<void>((resolve) => { open = resolve; }) });
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    const saver = screen.getByRole("button", { name: "Data saver · up to 360p" });
    expect(saver.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(saver);
    expect(uriOf(playerOf(screen))).toBe(MASTER);

    await act(async () => { open(); });
    await act(async () => {});
    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    await fireEvent.press(screen.getByRole("button", { name: "Data saver · up to 360p" }));
    expect(uriOf(playerOf(screen))).toBe(V360);
  });

  it("shows Couldn't play the video with Try again when playback fails, and reloads on a new grant", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(12); });

    await act(async () => { player.emitStatus("error"); });
    expect(screen.getByText("Couldn't play the video")).toBeTruthy();

    // The grant is still valid; Try again must still renew it, because the
    // same URL would keep the same native player and never reload.
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(posts).toBe(2);
    const retried = await nextPlayer(screen, player);
    expect(uriOf(retried)).toBe(masterUrl("tok2"));
    expect(retried.currentTime).toBe(12);
    await act(async () => { retried.emitStatus("readyToPlay"); });
    expect(retried.playing).toBe(true);
    expect(screen.queryByText("Couldn't play the video")).toBeNull();
  });

  it("keeps playing at the same position after a quality switch", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(10); });

    await pickQuality(screen, "720p");

    const next = playerOf(screen);
    expect(uriOf(next)).toBe(V720);
    expect(next.currentTime).toBe(10);
    expect(next.playing).toBe(true);
  });

  it("keeps mute across a quality switch", async () => {
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Mute" }));
    await pickQuality(screen, "720p");
    expect(playerOf(screen).muted).toBe(true);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
  });

  it("renews an expired grant on Play after a pause and resumes from the same place", async () => {
    servePlayback(() => readyBody({ expiresAt: "2000-01-01T00:05:00.000Z" }));
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(30); });
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(player.playing).toBe(false);

    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(posts).toBe(2);
    const renewed = await nextPlayer(screen, player);
    expect(uriOf(renewed)).toBe(masterUrl("tok2"));
    expect(renewed.currentTime).toBe(30);
    expect(renewed.playing).toBe(true);
  });

  it("renews an expired grant on a chosen quality without falling back to the master", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    servePlayback(shortGrant);
    const { screen } = await renderPlayer();
    await startPlaying(screen);
    await pickQuality(screen, "720p");
    const player = playerOf(screen);
    await act(async () => { player.emitStatus("readyToPlay"); });
    await act(async () => { player.emitTimeUpdate(20); });
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));

    advanceClock(60_000);
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    const renewed = await nextPlayer(screen, player);
    expect(uriOf(renewed)).toBe(variantUrl(720, "tok2"));
    expect(renewed.currentTime).toBe(20);
    expect(createdPlayers.some((p) => uriOf(p) === masterUrl("tok2"))).toBe(false);
  });

  it("restarts from the beginning when Play renews an expired grant after the video ends", async () => {
    servePlayback(() => readyBody({ expiresAt: "2000-01-01T00:05:00.000Z" }));
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(42); });

    await act(async () => { player.emitPlayToEnd(); });
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(posts).toBe(2);
    const renewed = await nextPlayer(screen, player);
    expect(renewed.currentTime).toBe(0);
    expect(renewed.playing).toBe(true);
  });

  it("renews on Play when the grant expired during a pause, though nothing re-rendered", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    servePlayback(shortGrant);
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(30); });
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));

    advanceClock(60_000);
    await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
    expect(posts).toBe(2);
    const renewed = await nextPlayer(screen, player);
    expect(uriOf(renewed)).toBe(masterUrl("tok2"));
    expect(renewed.currentTime).toBe(30);
    expect(renewed.playing).toBe(true);
  });

  it("renews a grant that expired in the background, and comes back paused without an error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    servePlayback(shortGrant);
    const appState = captureAppState();
    try {
      const { screen } = await renderPlayer();
      const player = await startPlaying(screen);
      await act(async () => { player.emitTimeUpdate(25); });
      await act(async () => { appState.emit("background"); });
      const builtBefore = createdPlayers.length;

      advanceClock(60_000);
      await act(async () => { appState.emit("active"); });
      const renewed = await nextPlayer(screen, player);
      expect(posts).toBe(2);
      // The expired URL is never loaded again.
      expect(createdPlayers.slice(builtBefore).some((p) => uriOf(p) === MASTER)).toBe(false);
      expect(uriOf(renewed)).toBe(masterUrl("tok2"));
      expect(renewed.currentTime).toBe(25);
      await act(async () => { renewed.emitStatus("readyToPlay"); });
      expect(renewed.playing).toBe(false);
      expect(screen.queryByText("Couldn't play the video")).toBeNull();
      expect(screen.getByTestId("listing-video-player-play-pause").props.accessibilityLabel).toBe("Play");
    } finally {
      appState.restore();
    }
  });

  it("renews an expired grant before loading a newly chosen quality", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    servePlayback(shortGrant);
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    await act(async () => { player.emitTimeUpdate(15); });

    advanceClock(60_000);
    await pickQuality(screen, "720p");
    expect(posts).toBe(2);
    const renewed = await nextPlayer(screen, player);
    expect(uriOf(renewed)).toBe(variantUrl(720, "tok2"));
    expect(renewed.currentTime).toBe(15);
    expect(renewed.playing).toBe(true);
    expect(createdPlayers.some((p) => uriOf(p) === V720)).toBe(false);
  });

  it("keeps playing the same video when the app is only inactive", async () => {
    const appState = captureAppState();
    try {
      const { screen } = await renderPlayer();
      const player = await startPlaying(screen);

      // Control Center, the app switcher or a call banner.
      await act(async () => { appState.emit("inactive"); });
      expect(playerOf(screen)).toBe(player);
      expect(player.released).toBe(false);

      await act(async () => { appState.emit("active"); });
      expect(playerOf(screen)).toBe(player);
      expect(player.playing).toBe(true);
    } finally {
      appState.restore();
    }
  });

  it("keeps the manual qualities disabled when the master playlist cannot be read", async () => {
    servePlayback(() => readyBody(), 200, { playlistStatus: 500 });
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    for (const name of ["720p", "360p", "Data saver · up to 360p"]) {
      expect(screen.getByRole("button", { name }).props.accessibilityState).toMatchObject({ disabled: true });
    }
    expect(screen.getByRole("button", { name: "Auto" }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("does not offer Data saver when no rendition fits its cap", async () => {
    servePlayback(() => readyBody({ qualities: [720] }));
    const { screen } = await renderPlayer();
    await startPlaying(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    expect(screen.queryByRole("button", { name: "Data saver · up to 360p" })).toBeNull();
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

  it("unloads the video in the background and comes back paused at the same place", async () => {
    const appState = captureAppState();
    try {
      const { screen } = await renderPlayer();
      const player = await startPlaying(screen);
      await act(async () => { player.emitTimeUpdate(25); });

      await act(async () => { appState.emit("background"); });
      expect(player.playing).toBe(false);
      expect(player.released).toBe(true);
      expect(uriOf(playerOf(screen))).toBeUndefined();

      await act(async () => { appState.emit("active"); });
      const back = playerOf(screen);
      expect(uriOf(back)).toBe(MASTER);
      expect(back.currentTime).toBe(25);
      await act(async () => { back.emitStatus("readyToPlay"); });
      expect(back.playing).toBe(false);
      expect(screen.getByTestId("listing-video-player-play-pause").props.accessibilityLabel).toBe("Play");
      expect(screen.getByText("0:25")).toBeTruthy();
    } finally {
      appState.restore();
    }
  });

  it("releases playback when unmounted", async () => {
    const { screen } = await renderPlayer();
    const player = await startPlaying(screen);
    expect(player.playing).toBe(true);

    await act(async () => { screen.unmount(); });
    expect(player.playing).toBe(false);
    expect(player.released).toBe(true);
  });

  describe("tester measurements", () => {
    async function renderTimed() {
      let clock = 10_000;
      const screen = await renderMobile(
        <ListingVideoPlayer audience="viewer" type="listing" id={LISTING_ID} onClose={vi.fn()} now={() => clock} />,
      );
      return { screen, tick: (ms: number) => { clock += ms; } };
    }

    it("reports how long Play took to show the first frame, once", async () => {
      const { screen, tick } = await renderTimed();
      await act(async () => {});
      tick(1_850);
      const player = await startPlaying(screen);
      // A pause and play again is not another start.
      await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
      await fireEvent.press(screen.getByTestId("listing-video-player-play-pause"));
      expect(player.playing).toBe(true);

      await waitFor(() => expect(sentVideoTelemetry).toEqual([
        { event: "playback_started", audience: "viewer", quality: "auto", startupMs: 1_850 },
      ]));
    });

    it("reports stalls after the start when the player closes, and never the grant URL", async () => {
      const { screen, tick } = await renderTimed();
      tick(900);
      const player = await startPlaying(screen);
      await act(async () => { player.emitTimeUpdate(12); });
      await act(async () => { player.emitStatus("loading"); });
      tick(2_000);
      await act(async () => { player.emitStatus("readyToPlay"); });
      await act(async () => { player.emitStatus("loading"); });
      tick(500);
      await act(async () => { player.emitStatus("readyToPlay"); });
      await act(async () => { player.emitTimeUpdate(30.4); });

      await act(async () => { screen.unmount(); });

      await waitFor(() => expect(sentVideoTelemetry).toEqual([
        { event: "playback_started", audience: "viewer", quality: "auto", startupMs: 900 },
        { event: "playback_buffering", audience: "viewer", stallCount: 2, stallMs: 2_500, watchedMs: 30_400 },
      ]));
      const sent = JSON.stringify(sentVideoTelemetry);
      for (const secret of ["grant", "tok", "http", LISTING_ID, VIDEO_ID, GENERATION_ID]) expect(sent).not.toContain(secret);
    });

    it("reports nothing when the video never started", async () => {
      servePlayback(() => ({ status: "unavailable" }), 404);
      const { screen } = await renderTimed();
      expect(await screen.findByText("Video unavailable")).toBeTruthy();
      await act(async () => { screen.unmount(); });
      await act(async () => {});
      expect(sentVideoTelemetry).toEqual([]);
    });
  });
});
