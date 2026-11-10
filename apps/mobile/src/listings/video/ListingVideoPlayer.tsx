import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import { VideoView, useVideoPlayer, type VideoPlayerStatus } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Maximize, Minimize, Pause, Play, Settings, Volume2, VolumeX, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { formatMmss } from "./listingVideo";
import {
  parseMasterPlaylist,
  qualityOptions,
  variantUrlFor,
  type VideoQualityChoice,
} from "./videoPlayback";
import {
  useListingPlayback,
  type PlaybackTarget,
} from "./useListingPlayback";
import { sendListingVideoTelemetry } from "./listingVideoTelemetry";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

interface ListingVideoPlayerProps extends PlaybackTarget {
  onClose: () => void;
  /** Wall clock in epoch ms, for grant expiry and playback measurements. */
  now?: () => number;
}

/**
 * Full-screen player for one Ready Listing video (#1046). It exists only
 * after an explicit Play tap: mounting it issues the playback grant, and
 * closing or backgrounding stops playback and fetching. The whole frame
 * is shown (`contain`), never cropped or stretched.
 */
export function ListingVideoPlayer({ audience, type, id, onClose, now = Date.now }: ListingVideoPlayerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { playback, retry } = useListingPlayback({ audience, type, id });
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const masterUrl = playback.phase === "ready" ? playback.url : undefined;
  const durationS = playback.phase === "ready" ? playback.durationMs / 1000 : 0;
  const qualities = playback.phase === "ready" ? playback.qualities : [];

  // Variants are kept with the master URL they came from, so a renewed
  // grant never loads a stale variant.
  const [variants, setVariants] = useState<{ master: string; map: ReadonlyMap<number, string> } | null>(null);
  const [choice, setChoice] = useState<VideoQualityChoice>("auto");
  const [foreground, setForeground] = useState(true);
  const [status, setStatus] = useState<VideoPlayerStatus>("idle");
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [positionS, setPositionS] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);

  const positionRef = useRef(0);
  // A seek makes the player load at the new position; that wait is not a stall.
  const seekPendingRef = useRef(false);
  const mutedRef = useRef(false);
  // Explicit user intent: the native player can report `readyToPlay` again
  // after a pause, and that must never undo the pause.
  const intentRef = useRef(true);
  const startedRef = useRef(false);
  // Position and play intent to apply to the next player that has a source.
  const restoreRef = useRef<{ position: number; playing: boolean } | null>(null);

  // Tester measurements (#1052): time from the Play tap (this mount) to the
  // first playing frame, then stalls until the player closes. Only counts
  // and durations are reported; the grant URL never leaves this component.
  const [openedAt] = useState(now);
  const openedAtRef = useRef(openedAt);
  const measureRef = useRef({ started: false, stallSince: null as number | null, stallCount: 0, stallMs: 0, furthestS: 0 });
  const reportRef = useRef({ audience, now });
  reportRef.current = { audience, now };
  const choiceRef = useRef(choice);
  choiceRef.current = choice;

  // Variant URLs come from the granted master playlist itself, so a manual
  // quality never invents a storage key the server did not publish. This is
  // a grant-authorized media fetch (the token is in the URL), like the
  // player's own segment requests, not an API call through apiClient.
  useEffect(() => {
    if (!masterUrl) return;
    let live = true;
    const settle = (map: ReadonlyMap<number, string>) => { if (live) setVariants({ master: masterUrl, map }); };
    fetch(masterUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`master playlist ${res.status}`);
        settle(parseMasterPlaylist(await res.text(), qualities));
      })
      // Without variants only Auto can play.
      .catch(() => settle(new Map()));
    return () => { live = false; };
    // A new grant brings a new master URL; its qualities come with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterUrl]);

  const variantsReady = !!masterUrl && variants?.master === masterUrl;
  const urlFor = (option: VideoQualityChoice) =>
    !masterUrl ? undefined
      : option === "auto" ? masterUrl
        : variantsReady ? variantUrlFor(option, masterUrl, variants.map) : undefined;
  // A manual choice waits for this grant's variants rather than briefly
  // loading the master, so its player is the one that gets the position.
  // In the background nothing is loaded at all.
  const sourceUri = foreground ? urlFor(choice) : undefined;
  const choiceUnavailable = variantsReady && choice !== "auto" && sourceUri === undefined && foreground;
  // A renewed grant whose variants cannot be read leaves only Auto.
  useEffect(() => {
    if (choiceUnavailable) setChoice("auto");
  }, [choiceUnavailable]);
  const source = useMemo(
    () => (sourceUri ? { uri: sourceUri, contentType: "hls" as const } : null),
    [sourceUri],
  );
  // expo-video builds a new native player whenever the source changes, so
  // per-player settings are applied here on every one of them.
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.muted = mutedRef.current;
  });
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    setStatus(player.status ?? "idle");
    setPlaying(!!player.playing);
    // A swapped-in player (background return, quality switch, renewed
    // grant) starts clean: a stall still open on the player it replaces is
    // discarded, and this player's own loading does not count until it has
    // played and the viewer still wants playback.
    measureRef.current.stallSince = null;
    let playedHere = false;
    let loadedHere = false;
    const subs = [
      player.addListener?.("statusChange", (e: { status: VideoPlayerStatus }) => {
        setStatus(e.status);
        const measure = measureRef.current;
        if (e.status === "loading") {
          if (measure.started && playedHere && loadedHere && intentRef.current && !seekPendingRef.current && measure.stallSince === null) measure.stallSince = now();
        } else {
          if (e.status === "readyToPlay") loadedHere = true;
          seekPendingRef.current = false;
          if (measure.stallSince !== null) {
            measure.stallCount += 1;
            measure.stallMs += now() - measure.stallSince;
            measure.stallSince = null;
          }
        }
        if (e.status === "readyToPlay" && intentRef.current) {
          startedRef.current = true;
          try { player.play(); } catch { /* native stub */ }
        }
      }),
      player.addListener?.("playingChange", (e: { isPlaying: boolean }) => {
        setPlaying(e.isPlaying);
        if (e.isPlaying) playedHere = true;
        if (e.isPlaying && !measureRef.current.started) {
          measureRef.current.started = true;
          const picked = choiceRef.current;
          const quality = picked === "auto" || picked === "data-saver" ? picked : (`${picked}` as const);
          sendListingVideoTelemetry({ event: "playback_started", audience, quality, startupMs: Math.max(0, Math.round(now() - openedAt)) });
        }
      }),
      player.addListener?.("timeUpdate", (e: { currentTime: number }) => {
        positionRef.current = e.currentTime;
        measureRef.current.furthestS = Math.max(measureRef.current.furthestS, e.currentTime);
        setPositionS(e.currentTime);
      }),
      player.addListener?.("playToEnd", () => {
        intentRef.current = false;
        setPlaying(false);
        setEnded(true);
      }),
    ];
    // Placeholder players (no grant yet, a pending variant, background)
    // must not use up the saved position.
    const restore = restoreRef.current;
    if (restore && sourceUri) {
      restoreRef.current = null;
      try {
        player.currentTime = restore.position;
        if (restore.playing) player.play();
      } catch { /* native stub */ }
    }
    return () => { subs.forEach((sub) => { try { sub?.remove(); } catch { /* stub */ } }); };
    // `sourceUri` changes exactly when `player` does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // A grant lives five minutes and the server refuses an expired one, so
  // expiry is read from the clock whenever a player is about to be built
  // from it, never from a value computed at the last render.
  const grantExpired = () => {
    const current = playbackRef.current;
    return current.phase === "ready" && !!current.expiresAt && Date.parse(current.expiresAt) <= now();
  };

  // Renews the grant and reloads at `position`. A new grant's token changes
  // the URL, which is what makes expo-video build a new native player; the
  // same URL would keep a failed one.
  const renew = (position: number, playing: boolean) => {
    intentRef.current = playing;
    restoreRef.current = { position, playing };
    setEnded(false);
    setStatus("loading");
    void retry();
  };

  // Backgrounding stops playback and downloading: the source is unloaded
  // and the position kept. Returning reloads it paused at that position,
  // on a renewed grant if this one expired meanwhile. `inactive` (Control
  // Center, the app switcher, a call banner) changes nothing.
  const onAppState = (state: string) => {
    if (state === "background" && foregroundRef.current) {
      foregroundRef.current = false;
      intentRef.current = false;
      measureRef.current.stallSince = null;
      restoreRef.current = { position: restoreRef.current?.position ?? positionRef.current, playing: false };
      try { playerRef.current.pause(); } catch { /* native stub */ }
      setForeground(false);
    } else if (state === "active" && !foregroundRef.current) {
      foregroundRef.current = true;
      setForeground(true);
      if (grantExpired()) renew(restoreRef.current?.position ?? positionRef.current, intentRef.current);
    }
  };
  const onAppStateRef = useRef(onAppState);
  onAppStateRef.current = onAppState;
  const foregroundRef = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => onAppStateRef.current(state));
    return () => sub.remove();
  }, []);

  // Leaving the player releases the native player (hook cleanup) after pause.
  useEffect(() => () => {
    try { playerRef.current.pause(); } catch { /* native stub */ }
    const measure = measureRef.current;
    const { audience: viewedAs, now: clock } = reportRef.current;
    if (!measure.started) {
      // No first frame: say how long the viewer waited before leaving.
      sendListingVideoTelemetry({ event: "playback_abandoned", audience: viewedAs, waitedMs: Math.max(0, Math.round(clock() - openedAtRef.current)) });
      return;
    }
    const openStallMs = measure.stallSince === null ? 0 : clock() - measure.stallSince;
    sendListingVideoTelemetry({
      event: "playback_buffering",
      audience: viewedAs,
      stallCount: measure.stallCount + (measure.stallSince === null ? 0 : 1),
      stallMs: Math.max(0, Math.round(measure.stallMs + openStallMs)),
      // The furthest position reached, not the total time spent playing.
      watchedMs: Math.round(measure.furthestS * 1000),
    });
  }, []);

  const playerError = status === "error";
  const showError = playback.phase === "error" || playerError;
  const waitingForSource = playback.phase === "loading" || (playback.phase === "ready" && foreground && !sourceUri);
  const buffering = status === "loading" && startedRef.current && !playerError && !waitingForSource;
  const loading = !showError && playback.phase !== "unavailable"
    && (waitingForSource || (status !== "readyToPlay" && !startedRef.current));

  const tryAgain = () => renew(restoreRef.current?.position ?? positionRef.current, true);

  const togglePlay = () => {
    // A grant lives five minutes; replaying on an expired one goes nowhere,
    // so a Play tap renews it and restarts from the same place.
    if (!playing && grantExpired()) {
      if (ended) {
        positionRef.current = 0;
        setPositionS(0);
      }
      renew(ended ? 0 : positionRef.current, true);
      return;
    }
    try {
      if (ended) {
        intentRef.current = true;
        player.currentTime = 0;
        positionRef.current = 0;
        setPositionS(0);
        setEnded(false);
        player.play();
      } else if (playing) {
        intentRef.current = false;
        player.pause();
      } else {
        intentRef.current = true;
        player.play();
      }
    } catch { /* native stub */ }
  };

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { player.muted = next; } catch { /* native stub */ }
  };

  // In-app full screen, as in the prototype: the header goes away and the
  // controls stay reachable. The native fullscreen presentation would hide
  // them behind a view with no exit of its own (nativeControls is off).
  const toggleFullscreen = () => setFullscreen((value) => !value);

  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(durationS || 0, seconds));
    seekPendingRef.current = true;
    try { player.currentTime = clamped; } catch { /* native stub */ }
    positionRef.current = clamped;
    setPositionS(clamped);
    if (clamped < (durationS || 0)) setEnded(false);
  };

  const onSeekPress = (event: GestureResponderEvent) => {
    if (!durationS) return;
    seekTo((event.nativeEvent.locationX / Math.max(1, trackWidth)) * durationS);
  };

  const close = () => {
    intentRef.current = false;
    try { player.pause(); } catch { /* native stub */ }
    onClose();
  };

  const options = qualityOptions(qualities);
  const choiceLabel = (optionChoice: VideoQualityChoice) =>
    optionChoice === "auto" ? t("videoPlayerAuto")
      : optionChoice === "data-saver" ? t("videoPlayerDataSaver")
        : `${optionChoice}p`;
  const controlsDisabled = loading || showError || playback.phase !== "ready";

  return (
    <View className="flex-1 bg-black" testID="listing-video-player">
      {!fullscreen && (
        <View className="flex-row items-center justify-between px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("videoPlayerClose")}
            onPress={close}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/15"
          >
            <Icon as={X} className="size-5 text-white" />
          </Pressable>
          <Text className="text-callout font-semibold text-white">
            {t("videoPlayerTitle")} · {formatMmss(durationS)}
          </Text>
          <View className="w-11" />
        </View>
      )}

      <View className="flex-1 items-center justify-center">
        {masterUrl && (
          <VideoView
            testID="listing-video-player-view"
            player={player}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            nativeControls={false}
            onFullscreenEnter={() => setFullscreen(true)}
            onFullscreenExit={() => setFullscreen(false)}
          />
        )}

        {loading && !buffering && (
          <View className="absolute items-center gap-3" accessibilityLiveRegion="polite">
            <ActivityIndicator color="#fff" size="large" />
            <Text className="text-body text-white">{t("videoPlayerLoading")}</Text>
          </View>
        )}
        {buffering && (
          <View className="absolute items-center gap-3" accessibilityLiveRegion="polite">
            <ActivityIndicator color="#fff" size="large" />
            <Text className="text-body text-white">{t("videoPlayerBuffering")}</Text>
          </View>
        )}
        {playback.phase === "unavailable" && (
          <View className="absolute items-center gap-2 px-8" accessibilityLiveRegion="polite">
            <Text className="text-subhead font-semibold text-white">{t("videoPlayerUnavailableTitle")}</Text>
            <Text className="text-center text-footnote text-white/70">{t("videoPlayerUnavailableBody")}</Text>
          </View>
        )}
        {showError && playback.phase !== "unavailable" && (
          <View className="absolute items-center gap-2 px-8" accessibilityLiveRegion="polite">
            <Text className="text-subhead font-semibold text-white">{t("videoPlayerErrorTitle")}</Text>
            <Text className="text-center text-footnote text-white/70">{t("videoPlayerErrorBody")}</Text>
            <Button size="sm" onPress={tryAgain} accessibilityLabel={t("tryAgain")} className="mt-2">
              <Text>{t("tryAgain")}</Text>
            </Button>
          </View>
        )}
        {!playing && !loading && !showError && playback.phase === "ready" && status === "readyToPlay" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("videoPlayerPlay")}
            onPress={togglePlay}
            className="absolute h-[72px] w-[72px] items-center justify-center rounded-full bg-white/20"
          >
            <Icon as={Play} className="size-8 text-white" />
          </Pressable>
        )}
      </View>

      <View className="gap-3 px-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row items-center gap-3">
          <Text className="text-footnote text-white">{formatMmss(positionS)}</Text>
          <Pressable
            testID="listing-video-player-seek"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t("videoPlayerSeek")}
            accessibilityValue={{ min: 0, max: durationS, now: Math.round(positionS), text: `${formatMmss(positionS)} / ${formatMmss(durationS)}` }}
            accessibilityActions={[{ name: "increment", label: t("videoPlayerSeek") }, { name: "decrement", label: t("videoPlayerSeek") }]}
            onAccessibilityAction={(event) => seekTo(positionRef.current + (event.nativeEvent.actionName === "increment" ? 10 : -10))}
            onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
            onPress={onSeekPress}
            disabled={controlsDisabled}
            className="h-11 flex-1 justify-center"
          >
            <View className="h-1 rounded bg-white/30">
              <View className="h-1 rounded bg-white" style={{ width: `${durationS ? (positionS / durationS) * 100 : 0}%` }} />
            </View>
          </Pressable>
          <Text className="text-footnote text-white">{formatMmss(durationS)}</Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Pressable
            testID="listing-video-player-play-pause"
            accessibilityRole="button"
            accessibilityLabel={playing ? t("videoPlayerPause") : t("videoPlayerPlay")}
            onPress={togglePlay}
            disabled={controlsDisabled}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/15"
          >
            <Icon as={playing ? Pause : Play} className="size-5 text-white" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? t("videoPlayerUnmute") : t("videoPlayerMute")}
            accessibilityState={{ selected: muted }}
            onPress={toggleMute}
            disabled={controlsDisabled}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/15"
          >
            <Icon as={muted ? VolumeX : Volume2} className="size-5 text-white" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("videoPlayerQuality")}
            onPress={() => setQualityOpen(true)}
            disabled={controlsDisabled}
            className="h-11 flex-row items-center gap-1.5 rounded-full bg-white/15 px-3.5"
          >
            <Icon as={Settings} className="size-4 text-white" />
            <Text className="text-footnote font-semibold text-white">{choiceLabel(choice)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fullscreen ? t("videoPlayerExitFullscreen") : t("videoPlayerFullscreen")}
            onPress={toggleFullscreen}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/15"
          >
            <Icon as={fullscreen ? Minimize : Maximize} className="size-5 text-white" />
          </Pressable>
        </View>
      </View>

      {qualityOpen && (
        <View className="absolute inset-0 justify-end bg-black/60">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("videoPlayerClose")}
            onPress={() => setQualityOpen(false)}
            className="flex-1"
          />
          <View className="gap-2 rounded-t-3xl bg-neutral-900 px-4 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
            <Text className="text-subhead font-semibold text-white">{t("videoPlayerQuality")}</Text>
            {options.map((option) => {
              const selected = choice === option.choice;
              // Fixed renditions and Data saver need a variant of this grant;
              // until one is known (or if none can be read) only Auto is real.
              const disabled = urlFor(option.choice) === undefined;
              return (
                <Pressable
                  key={String(option.choice)}
                  accessibilityRole="button"
                  accessibilityLabel={choiceLabel(option.choice)}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    // Only a different choice builds a new player to restore into,
                    // and an expired grant's variant URLs would be refused.
                    if (option.choice !== choice) {
                      setChoice(option.choice);
                      if (grantExpired()) {
                        renew(positionRef.current, intentRef.current);
                      } else {
                        restoreRef.current = { position: positionRef.current, playing: intentRef.current };
                      }
                    }
                    setQualityOpen(false);
                  }}
                  className={`flex-row items-center justify-between rounded-xl px-4 py-3 ${selected ? "bg-white" : "bg-white/10"} ${disabled ? "opacity-40" : ""}`}
                >
                  <Text className={`text-body ${selected ? "font-semibold text-black" : "text-white"}`}>
                    {choiceLabel(option.choice)}
                  </Text>
                  {selected && <Icon as={Check} className="size-4 text-black" />}
                </Pressable>
              );
            })}
            <Text className="text-footnote text-white/60">{t("videoPlayerQualityNote")}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
