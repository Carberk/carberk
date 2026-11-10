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

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

interface ListingVideoPlayerProps extends PlaybackTarget {
  onClose: () => void;
}

/**
 * Full-screen player for one Ready Listing video (#1046). It exists only
 * after an explicit Play tap: mounting it issues the playback grant, and
 * closing or backgrounding stops playback and fetching. The whole frame
 * is shown (`contain`), never cropped or stretched.
 */
export function ListingVideoPlayer({ audience, type, id, onClose }: ListingVideoPlayerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { playback, retry } = useListingPlayback({ audience, type, id });

  const masterUrl = playback.phase === "ready" ? playback.url : undefined;
  const durationS = playback.phase === "ready" ? playback.durationMs / 1000 : 0;

  const [variants, setVariants] = useState<ReadonlyMap<number, string>>(new Map());
  const [choice, setChoice] = useState<VideoQualityChoice>("auto");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<VideoPlayerStatus>("idle");
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [positionS, setPositionS] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);

  const viewRef = useRef<VideoView | null>(null);
  const positionRef = useRef(0);
  const playingRef = useRef(false);
  // Explicit user intent: the native player can report `readyToPlay` again
  // after a pause, and that must never undo the pause.
  const intentRef = useRef(true);
  const startedRef = useRef(false);
  const restoreRef = useRef<{ position: number; playing: boolean } | null>(null);

  // Variant URLs come from the granted master playlist itself, so a manual
  // quality never invents a storage key the server did not publish.
  useEffect(() => {
    setVariants(new Map());
    if (!masterUrl) return;
    let live = true;
    fetch(masterUrl)
      .then((res) => res.text())
      .then((text) => { if (live) setVariants(parseMasterPlaylist(text)); })
      .catch(() => { /* Auto keeps the master URL; manual picks fall back too. */ });
    return () => { live = false; };
  }, [masterUrl]);

  const sourceUri = masterUrl ? variantUrlFor(choice, masterUrl, variants) : undefined;
  const source = useMemo(
    () => (sourceUri ? { uri: sourceUri, contentType: "hls" as const } : null),
    // `attempt` forces a fresh player when Try again reloads the same URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceUri, attempt],
  );
  const player = useVideoPlayer(source, (p) => { p.timeUpdateEventInterval = 0.25; });
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    const restore = restoreRef.current;
    if (restore) {
      restoreRef.current = null;
      try {
        player.currentTime = restore.position;
        if (restore.playing) player.play();
      } catch { /* native stub */ }
    }
    const subs = [
      player.addListener?.("statusChange", (e: { status: VideoPlayerStatus }) => {
        setStatus(e.status);
        if (e.status === "readyToPlay" && intentRef.current) {
          startedRef.current = true;
          try { player.play(); } catch { /* native stub */ }
        }
      }),
      player.addListener?.("playingChange", (e: { isPlaying: boolean }) => {
        playingRef.current = e.isPlaying;
        setPlaying(e.isPlaying);
      }),
      player.addListener?.("timeUpdate", (e: { currentTime: number }) => {
        positionRef.current = e.currentTime;
        setPositionS(e.currentTime);
      }),
      player.addListener?.("playToEnd", () => {
        playingRef.current = false;
        intentRef.current = false;
        setPlaying(false);
        setEnded(true);
      }),
    ];
    return () => { subs.forEach((sub) => { try { sub?.remove(); } catch { /* stub */ } }); };
  }, [player]);

  // expo-video replaces the source on the same native player, and a
  // replacement loads paused: re-apply the kept position and play intent.
  const firstSourceRef = useRef(true);
  useEffect(() => {
    if (firstSourceRef.current) {
      firstSourceRef.current = false;
      return;
    }
    if (!sourceUri) return;
    const restore = restoreRef.current;
    if (restore) {
      restoreRef.current = null;
      try { player.currentTime = restore.position; } catch { /* native stub */ }
    }
    if (intentRef.current) {
      try { player.play(); } catch { /* native stub */ }
    }
  }, [sourceUri, player]);

  // Backgrounding stops playback and downloading; returning never resumes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        intentRef.current = false;
        try { playerRef.current.pause(); } catch { /* native stub */ }
      }
    });
    return () => sub.remove();
  }, []);

  // Leaving the player releases the native player (hook cleanup) after pause.
  useEffect(() => () => {
    try { playerRef.current.pause(); } catch { /* native stub */ }
  }, []);

  const grantExpired = playback.phase === "ready" && playback.expiresAt
    ? Date.parse(playback.expiresAt) <= Date.now()
    : false;
  const playerError = status === "error";
  const showError = playback.phase === "error" || playerError;
  const buffering = status === "loading" && startedRef.current && !playerError;
  const loading = !showError && playback.phase !== "unavailable"
    && (playback.phase === "loading" || (status !== "readyToPlay" && !startedRef.current));

  const tryAgain = () => {
    intentRef.current = true;
    restoreRef.current = { position: positionRef.current, playing: true };
    setEnded(false);
    if (playback.phase !== "ready" || grantExpired || !masterUrl) {
      void retry();
    } else {
      setStatus("loading");
      setAttempt((value) => value + 1);
    }
  };

  const togglePlay = () => {
    // A grant lives five minutes; replaying on an expired one goes nowhere,
    // so a Play tap renews it and restarts from the same place.
    if (!playing && grantExpired) {
      intentRef.current = true;
      restoreRef.current = { position: ended ? 0 : positionRef.current, playing: true };
      if (ended) setEnded(false);
      void retry();
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
    setMuted(next);
    try { player.muted = next; } catch { /* native stub */ }
  };

  // In-app full screen, as in the prototype: the header goes away and the
  // controls stay reachable. The native fullscreen presentation would hide
  // them behind a view with no exit of its own (nativeControls is off).
  const toggleFullscreen = () => setFullscreen((value) => !value);

  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(durationS || 0, seconds));
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

  const options = qualityOptions(playback.phase === "ready" ? playback.qualities : []);
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
            ref={viewRef}
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
              return (
                <Pressable
                  key={String(option.choice)}
                  accessibilityRole="button"
                  accessibilityLabel={choiceLabel(option.choice)}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    restoreRef.current = { position: positionRef.current, playing: intentRef.current };
                    setChoice(option.choice);
                    setQualityOpen(false);
                  }}
                  className={`flex-row items-center justify-between rounded-xl px-4 py-3 ${selected ? "bg-white" : "bg-white/10"}`}
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
