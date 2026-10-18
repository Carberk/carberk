import { useEffect, useRef, useState } from "react";
import { AppState, Modal, ScrollView, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTranslation } from "react-i18next";
import { randomUUID } from "expo-crypto";
import { z } from "zod";

import { subscribeAuthSession } from "../../auth/session";
import { peekAuthSession } from "../../auth/sessionSnapshot";
import { apiClient } from "../../api/client";
import { emitMeasurement } from "../../measurement/nativeMeasurement";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export interface VideoPlaybackModalProps { listingId: string; generationId: string; renditions: number[]; onClose(): void; }
const grantSchema = z.object({ url: z.string().regex(/^\/video-grants\/[A-Za-z0-9_-]{43}\/master\.m3u8$/), generationId: z.string().uuid(), expiresAt: z.string().datetime() }).strict();
const copy = {
 en: { close: "Close video", loading: "Loading video", buffering: "Buffering video", error: "Video could not play. Try again.", retry: "Retry video", auto: "Auto", saver: "Data saver (up to 360p)", mute: "Mute video", unmute: "Unmute video" },
 ru: { close: "Закрыть видео", loading: "Загрузка видео", buffering: "Буферизация видео", error: "Не удалось воспроизвести видео. Повторите попытку.", retry: "Повторить видео", auto: "Авто", saver: "Экономия трафика (до 360p)", mute: "Выключить звук", unmute: "Включить звук" },
 tk: { close: "Wideony ýap", loading: "Wideo ýüklenýär", buffering: "Wideo buferlenýär", error: "Wideony oýnadyp bolmady. Täzeden synanyşyň.", retry: "Täzeden oýnat", auto: "Awto", saver: "Trafik tygşytlamak (360p çenli)", mute: "Sesi öçür", unmute: "Sesi aç" },
};
/** Mounted only after Play. Expo owns native release on unmount; every explicit
 * exit also replaces the source with null before returning to its origin. */
export function VideoPlaybackModal({ listingId, generationId, renditions, onClose }: VideoPlaybackModalProps) {
 const { i18n } = useTranslation(); const c = copy[i18n.language === "ru" ? "ru" : i18n.language === "tk" ? "tk" : "en"];
 const focused = useIsFocused();
 const available = [...new Set(renditions.filter(value => [240, 360, 720].includes(value)))].sort((a, b) => a - b);
 const [quality, setQuality] = useState<number | "auto">("auto"), [saver, setSaver] = useState(false), [muted, setMuted] = useState(false);
 const [status, setStatus] = useState<"loading" | "ready" | "buffering" | "error">("loading");
 const player = useVideoPlayer(null, native => { native.loop = false; native.muted = false; native.audioMixingMode = "doNotMix"; native.timeUpdateEventInterval = 0.25; native.bufferOptions = { preferredForwardBufferDuration: 8 }; });
 const alive = useRef(true), request = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), upgrade = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const operations = useRef(Promise.resolve()), playing = useRef(false), first = useRef(true), playbackId = useRef(randomUUID()), startedAt = useRef(Date.now()), reported = useRef(false);
 const selection = useRef({ quality, saver, available }); selection.current = { quality, saver, available };
 const closeCallback = useRef(onClose); closeCallback.current = onClose;
 const report = (result: "success" | "technical_failure" | "cancelled") => { if (reported.current) return; reported.current = true; emitMeasurement({ eventName: "video_playback_result", purpose: "product_reliability", payload: { listingId, playbackId: playbackId.current, attemptId: playbackId.current, durationMs: Math.min(86400000, Math.max(0, Date.now() - startedAt.current)), result, ...(result === "technical_failure" ? { category: "unknown" as const } : {}) } }); };
 async function load() {
  const epoch = ++request.current; clearTimeout(timer.current); clearTimeout(upgrade.current);
  if (!alive.current) return; setStatus(first.current ? "loading" : "buffering");
  try {
   const grant = await apiClient.post(`/listings/${listingId}/video-grants`, { purpose: "playback" }, grantSchema);
   if (!alive.current || epoch !== request.current) return;
   if (grant.generationId !== generationId || Date.parse(grant.expiresAt) <= Date.now()) throw new Error("VIDEO_GENERATION_CHANGED");
   const current = selection.current;
   const constrained = current.available.filter(value => !current.saver || value <= 360);
   if (!constrained.length) throw new Error("VIDEO_RENDITION_UNAVAILABLE");
   const rendition = current.quality === "auto" ? (first.current || current.saver ? constrained[0] : undefined) : Math.min(current.quality, current.saver ? 360 : 720);
   if (rendition !== undefined && !constrained.includes(rendition)) throw new Error("VIDEO_RENDITION_UNAVAILABLE");
   const path = rendition === undefined ? grant.url : grant.url.replace(/master\.m3u8$/, `${rendition}/index.m3u8`);
   const uri = `${(process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3006/api/v1").replace(/\/$/, "")}${path}`;
   const wasPlaying = first.current || playing.current;
   operations.current = operations.current.catch(() => {}).then(async () => {
    if (!alive.current || epoch !== request.current) return;
    const position = player.currentTime;
    await player.replaceAsync({ uri, contentType: "hls", useCaching: false });
    if (!alive.current || epoch !== request.current) return;
    player.currentTime = position; if (wasPlaying) player.play(); first.current = false; setStatus("ready");
   });
   await operations.current;
   if (!alive.current || epoch !== request.current) return;
   timer.current = setTimeout(() => { void load(); }, Math.min(240000, Math.max(1000, Date.parse(grant.expiresAt) - Date.now() - 10000)));
   if (rendition !== undefined && current.quality === "auto" && !current.saver) upgrade.current = setTimeout(() => { if (playing.current) void load(); }, 8000);
  } catch { if (alive.current && epoch === request.current) { setStatus("error"); report("technical_failure"); } }
 }
 async function close() {
  if (!alive.current) return; alive.current = false; request.current++; clearTimeout(timer.current); clearTimeout(upgrade.current); player.pause();
  report("cancelled");
  try { await operations.current.catch(() => {}); await player.replaceAsync(null); } catch { /* Native release on unmount remains authoritative. */ } finally { closeCallback.current(); }
 }
 const actions = useRef({ load, close }); actions.current = { load, close };
 useEffect(() => {
  alive.current = true; void actions.current.load();
  const state = player.addListener("statusChange", event => { if (!alive.current) return; if (event.status === "error") { setStatus("error"); report("technical_failure"); } else if (event.status === "loading") setStatus(first.current ? "loading" : "buffering"); else if (event.status === "readyToPlay") setStatus("ready"); });
  const play = player.addListener("playingChange", event => { playing.current = event.isPlaying; });
  const end = player.addListener("playToEnd", () => { report("success"); });
  const ownerId = peekAuthSession()?.user.id;
  const unsubscribe = subscribeAuthSession(() => { if (peekAuthSession()?.user.id !== ownerId) void actions.current.close(); });
  const background = AppState.addEventListener("change", value => { if (value !== "active") void actions.current.close(); });
  return () => { alive.current = false; request.current++; clearTimeout(timer.current); clearTimeout(upgrade.current); state.remove(); play.remove(); end.remove(); background.remove(); unsubscribe(); report("cancelled"); };
 }, [player]);
 useEffect(() => { if (!focused) void actions.current.close(); }, [focused]);
 function choose(next: number | "auto", nextSaver = saver) { setQuality(next); setSaver(nextSaver); selection.current = { quality: next, saver: nextSaver, available }; void load(); }
 return <Modal visible animationType="fade" onRequestClose={() => { void close(); }}><View className="flex-1 bg-background px-4 py-8">
  <Button variant="outline" onPress={() => { void close(); }}><Text>{c.close}</Text></Button>
  <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} allowsPictureInPicture={false} style={{ flex: 1 }} />
  {status !== "ready" ? <Text accessibilityLiveRegion="polite">{status === "error" ? c.error : status === "buffering" ? c.buffering : c.loading}</Text> : null}
  {status === "error" ? <Button onPress={() => { reported.current = false; playbackId.current = randomUUID(); startedAt.current = Date.now(); void load(); }}><Text>{c.retry}</Text></Button> : null}
  <ScrollView horizontal className="max-h-14"><View className="flex-row gap-2 py-2">
   <Button variant="outline" accessibilityState={{ selected: quality === "auto" }} onPress={() => choose("auto")}><Text>{c.auto}</Text></Button>
   {available.filter(value => !saver || value <= 360).map(value => <Button key={value} variant="outline" accessibilityState={{ selected: quality === value }} onPress={() => choose(value)}><Text>{value}p</Text></Button>)}
   <Button variant="outline" accessibilityState={{ selected: saver }} onPress={() => choose("auto", !saver)}><Text>{c.saver}</Text></Button>
   <Button variant="outline" onPress={() => { player.muted = !muted; setMuted(!muted); }}><Text>{muted ? c.unmute : c.mute}</Text></Button>
  </View></ScrollView>
 </View></Modal>;
}
