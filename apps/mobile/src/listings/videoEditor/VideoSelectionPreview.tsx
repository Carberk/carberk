import { useEffect, useRef, useState } from "react";
import { View, Pressable, type GestureResponderEvent } from "react-native";
import { Image } from "expo-image";
import type { ImagePickerAsset } from "expo-image-picker";
import { useVideoPlayer, VideoView, type VideoThumbnail } from "expo-video";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

interface Props { asset: ImagePickerAsset; disabled?: boolean | undefined; onUse(selection: { sourceUri: string; startMs: number; endMs: number }, posterMs: number): void; }
const words = {
 en: { start: "Video start", end: "Video end", use: "Use video", play: "Preview video", poster: "Choose poster at", trim: "Choose an interval of up to 90 seconds", duration: "Selected duration", failure: "This video could not be read. Choose another video." },
 ru: { start: "Начало видео", end: "Конец видео", use: "Использовать видео", play: "Просмотр видео", poster: "Выбрать кадр", trim: "Выберите отрезок до 90 секунд", duration: "Длительность отрезка", failure: "Не удалось прочитать видео. Выберите другое." },
 tk: { start: "Wideonyň başy", end: "Wideonyň soňy", use: "Wideony ulan", play: "Wideony gör", poster: "Şu pursady saýla", trim: "90 sekunda çenli bölegi saýlaň", duration: "Saýlanan dowamlylyk", failure: "Wideo okalmady. Başga wideo saýlaň." },
};
/** Selection is always in source milliseconds. Native export later maps the
 * chosen poster into that prepared interval, never an untrimmed original. */
export function VideoSelectionPreview({ asset, disabled, onUse }: Props) {
 const { i18n } = useTranslation(); const c = words[i18n.language === "ru" ? "ru" : i18n.language === "tk" ? "tk" : "en"];
 const [duration, setDuration] = useState(Math.max(0, Math.floor(asset.duration ?? 0)));
 const [start, setStart] = useState(0), [end, setEnd] = useState(Math.min(duration, 90000)), [poster, setPoster] = useState(0);
 const [timeline, setTimeline] = useState<VideoThumbnail[]>([]);
 const [explicit, setExplicit] = useState(false), [error, setError] = useState(false), [thumbnails, setThumbnails] = useState<VideoThumbnail[]>([]);
 const width = useRef(1), dragging = useRef({ x: 0, value: 0 });
 const edited = useRef(false);
 const interval = useRef({ start, end }); interval.current = { start, end };
 const player = useVideoPlayer(asset.uri, video => { video.loop = false; video.muted = false; video.timeUpdateEventInterval = 0.1; });
 useEffect(() => {
  const loaded = player.addListener("sourceLoad", event => { const ms = Math.floor(event.duration * 1000); if (ms > 0) { setDuration(ms); if (!edited.current) { setStart(0); setEnd(Math.min(ms, 90000)); setPoster(0); } else { setStart(value => Math.max(0, Math.min(value, ms - 100))); setEnd(value => Math.min(ms, value)); setPoster(value => Math.min(ms - 1, value)); } } });
  const progress = player.addListener("timeUpdate", event => { if (event.currentTime * 1000 >= interval.current.end || event.currentTime * 1000 < interval.current.start) { player.pause(); player.currentTime = interval.current.start / 1000; } });
  const status = player.addListener("statusChange", event => { if (event.status === "error") setError(true); });
  return () => { loaded.remove(); progress.remove(); status.remove(); player.pause(); };
 }, [player]);
 useEffect(() => {
  if (end <= start) return;
  let current = true;
  const timer = setTimeout(() => { void player.generateThumbnailsAsync(Array.from({ length: 8 }, (_, index) => (start + Math.floor((end - start - 1) * index / 7)) / 1000), { maxWidth: 160, maxHeight: 120 }).then(images => {
   if (current) setThumbnails(images); else images.forEach(image => image.release());
  }).catch(() => { if (current) setError(true); }); }, 120);
  return () => { current = false; clearTimeout(timer); };
 }, [player, start, end]);
 useEffect(() => () => { thumbnails.forEach(image => image.release()); }, [thumbnails]);
 useEffect(() => {
  if (!duration) return;
  let current = true;
  void player.generateThumbnailsAsync(Array.from({ length: 8 }, (_, index) => Math.floor((duration - 1) * index / 7) / 1000), { maxWidth: 160, maxHeight: 120 }).then(images => { if (current) setTimeline(images); else images.forEach(image => image.release()); }).catch(() => { if (current) setError(true); });
  return () => { current = false; };
 }, [player, duration]);
 useEffect(() => () => { timeline.forEach(image => image.release()); }, [timeline]);
 function move(kind: "start" | "end", value: number) {
  if (disabled) return;
  const ms = Math.round(value);
  if (kind === "start") { const next = Math.max(0, Math.min(end - 100, ms)); setStart(next); setPoster(current => Math.max(next, current)); }
  else { const next = Math.max(start + 100, Math.min(duration, ms)); setEnd(next); setPoster(current => Math.min(next - 1, current)); }
  edited.current = true; setExplicit(true); player.pause();
 }
 function handle(kind: "start" | "end") {
  const value = kind === "start" ? start : end;
  return <View key={kind} accessible accessibilityRole="adjustable" accessibilityLabel={kind === "start" ? c.start : c.end} accessibilityValue={{ min: 0, max: duration / 1000, now: value / 1000, text: `${(value / 1000).toFixed(1)} s` }}
   accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={event => move(kind, value + (event.nativeEvent.actionName === "increment" ? 1000 : -1000))}
   onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled}
   onResponderGrant={(event: GestureResponderEvent) => { dragging.current = { x: event.nativeEvent.pageX, value }; }}
   onResponderMove={(event: GestureResponderEvent) => move(kind, dragging.current.value + (event.nativeEvent.pageX - dragging.current.x) / width.current * duration)}
   className="absolute top-0 h-14 w-8 rounded-md border-2 border-primary bg-primary/20" style={{ left: `${duration ? value / duration * 90 : 0}%` }} />;
 }
 const firstThumbnail = thumbnails[0];
 const chosenThumbnail = firstThumbnail ? thumbnails.reduce((closest, image) => Math.abs(image.requestedTime * 1000 - poster) < Math.abs(closest.requestedTime * 1000 - poster) ? image : closest, firstThumbnail) : undefined;
 const valid = duration > 0 && end > start && end - start <= 90000 && (duration <= 90000 || explicit) && !error;
 return <View className="gap-3">
  <VideoView player={player} nativeControls={false} contentFit="contain" style={{ width: "100%", height: 240 }} />
  <Button variant="outline" disabled={disabled || error} onPress={() => { player.currentTime = start / 1000; player.play(); }}><Text>{c.play}</Text></Button>
  <Text>{c.duration}: {((end - start) / 1000).toFixed(1)} s</Text>
  {duration > 90000 ? <Text>{c.trim}</Text> : null}
  <View onLayout={event => { width.current = Math.max(1, event.nativeEvent.layout.width * 0.9); }} className="h-14 rounded-md bg-muted">
   <View className="h-14 flex-row overflow-hidden rounded-md">{timeline.map((image, index) => <Image key={index} source={image} contentFit="cover" style={{ flex: 1, height: 56 }} />)}</View>
   <View className="absolute h-14 bg-primary/20" style={{ left: `${duration ? start / duration * 90 : 0}%`, width: `${duration ? (end - start) / duration * 90 : 0}%` }} />
   {handle("start")}{handle("end")}
  </View>
  {chosenThumbnail ? <View className="w-40 overflow-hidden rounded-md" style={{ aspectRatio: 4 / 3 }}><Image source={chosenThumbnail} contentFit="cover" style={{ width: "100%", height: "100%" }} /></View> : null}
  <View className="flex-row gap-1">{thumbnails.map((thumbnail, index) => {
   const time = Math.min(end - 1, Math.max(start, Math.round(thumbnail.requestedTime * 1000)));
   return <Pressable key={`${start}-${end}-${index}`} accessibilityRole="button" accessibilityLabel={`${c.poster} ${(time / 1000).toFixed(1)} s`} accessibilityState={{ selected: Math.abs(poster - time) < 100 }} disabled={disabled} onPress={() => { setPoster(time); player.currentTime = time / 1000; }} className="border-primary" style={{ flex: 1, aspectRatio: 4 / 3, borderWidth: Math.abs(poster - time) < 100 ? 2 : 0 }}><Image source={thumbnail} contentFit="cover" style={{ width: "100%", height: "100%" }} /></Pressable>;
  })}</View>
  {error ? <Text accessibilityRole="alert">{c.failure}</Text> : null}
  <Button disabled={disabled || !valid} onPress={() => onUse({ sourceUri: asset.uri, startMs: start, endMs: end }, poster)}><Text>{c.use}</Text></Button>
 </View>;
}
