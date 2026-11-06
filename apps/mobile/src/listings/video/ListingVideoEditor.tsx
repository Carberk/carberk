import { useEffect, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { Check, Play } from "lucide-react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import { useVideoThumbnails } from "./useVideoThumbnails";
import {
  LISTING_VIDEO_MAX_S,
  LISTING_VIDEO_MIN_S,
  coverTimesFor,
  formatMmss,
  isLongSource,
  withCover,
  withEnd,
  withStart,
  withTap,
  withWindow,
  type ListingVideoDraft,
} from "./listingVideo";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

const FRAME_YELLOW = "#FACC15";
const HANDLE_WIDTH = 44;

interface ListingVideoEditorProps {
  draft: ListingVideoDraft;
  onDraftChange: (draft: ListingVideoDraft) => void;
  onCancel: () => void;
  onChange: () => void;
  onUse: () => void;
}

type DragKind = "start" | "end" | "window";

export function ListingVideoEditor({ draft, onDraftChange, onCancel, onChange, onUse }: ListingVideoEditorProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [previewing, setPreviewing] = useState(false);
  const [hitMax, setHitMax] = useState(false);
  const [trackWidth, setTrackWidth] = useState(() => Math.max(1, windowWidth - 76));

  const durationS = draft.source.durationS;
  const selectedS = draft.endS - draft.startS;
  const long = isLongSource(draft);
  const covers = coverTimesFor(draft);
  const minS = Math.min(LISTING_VIDEO_MIN_S, durationS);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const widthRef = useRef(trackWidth);
  widthRef.current = trackWidth;
  const grantRef = useRef<{ x: number; snapshot: ListingVideoDraft } | null>(null);
  const trackRef = useRef<View | null>(null);
  const trackLeftRef = useRef(0);
  const player = useVideoPlayer(draft.source.uri, (p) => { p.timeUpdateEventInterval = 0.25; });
  const filmTimes = Array.from({ length: 9 }, (_, i) => Math.round((durationS * (i + 0.5)) / 9));
  const filmUris = useVideoThumbnails(draft.source.uri, filmTimes);
  const coverUris = useVideoThumbnails(draft.source.uri, covers);
  useEffect(() => {
    try { player.currentTime = draft.startS; } catch { /* native stub */ }
    if (previewing) { try { player.play(); } catch { /* stub */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.startS, draft.endS]);
  useEffect(() => {
    const sub = player.addListener?.("timeUpdate", (e: { currentTime: number }) => {
      if (e.currentTime >= draftRef.current.endS) { try { player.pause(); player.currentTime = draftRef.current.startS; } catch { /* stub */ } setPreviewing(false); }
    });
    return () => { try { sub?.remove(); } catch { /* stub */ } };
     
  }, [player]);

  const applyMove = (kind: DragKind, snapshot: ListingVideoDraft, deltaS: number) => {
    if (kind === "start") {
      const move = withStart(snapshot, snapshot.startS + deltaS);
      setHitMax(move.hitMax);
      onDraftChange(move.draft);
    } else if (kind === "end") {
      const move = withEnd(snapshot, snapshot.endS + deltaS);
      setHitMax(move.hitMax);
      onDraftChange(move.draft);
    } else {
      setHitMax(false);
      onDraftChange(withWindow(snapshot, snapshot.startS + deltaS));
    }
  };

  const makeHandlers = (kind: DragKind) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (event: GestureResponderEvent) => {
      grantRef.current = { x: event.nativeEvent.pageX, snapshot: draftRef.current };
      if (typeof trackRef.current?.measureInWindow === "function") trackRef.current.measureInWindow((x) => { trackLeftRef.current = x; });
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const grant = grantRef.current;
      if (!grant) return;
      const width = Math.max(1, widthRef.current);
      const deltaS = ((event.nativeEvent.pageX - grant.x) / width) * grant.snapshot.source.durationS;
      applyMove(kind, grant.snapshot, deltaS);
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const grant = grantRef.current;
      grantRef.current = null;
      if (kind === "window" && grant && Math.abs(event.nativeEvent.pageX - grant.x) < 8) {
        const width = Math.max(1, widthRef.current);
        const timeS = ((event.nativeEvent.pageX - trackLeftRef.current) / width) * grant.snapshot.source.durationS;
        const move = withTap(grant.snapshot, timeS);
        setHitMax(move.hitMax);
        onDraftChange(move.draft);
      }
    },
    onResponderTerminate: () => {
      grantRef.current = null;
    },
  });

  const startHandlers = makeHandlers("start");
  const endHandlers = makeHandlers("end");
  const windowHandlers = makeHandlers("window");

  const handleTap = (locationX: number) => {
    const width = Math.max(1, trackWidth);
    const timeS = (locationX / width) * durationS;
    const move = withTap(draft, timeS);
    setHitMax(move.hitMax);
    onDraftChange(move.draft);
  };

  const hint = hitMax
    ? t("listingVideoHintMax")
    : long
      ? t("listingVideoHintLong", { duration: formatMmss(durationS) })
      : t("listingVideoHintTrim");

  const startRange: [number, number] = [Math.max(0, draft.endS - LISTING_VIDEO_MAX_S), draft.endS - minS];
  const endRange: [number, number] = [draft.startS + minS, Math.min(durationS, draft.startS + LISTING_VIDEO_MAX_S)];

  const onEdgeAccessibilityAction = (kind: "start" | "end", actionName: string) => {
    const delta = actionName === "increment" ? 1 : actionName === "decrement" ? -1 : 0;
    if (delta === 0) return;
    const move = kind === "start" ? withStart(draft, draft.startS + delta) : withEnd(draft, draft.endS + delta);
    setHitMax(move.hitMax);
    onDraftChange(move.draft);
  };

  const leftPct = durationS > 0 ? (draft.startS / durationS) * 100 : 0;
  const widthPct = durationS > 0 ? ((draft.endS - draft.startS) / durationS) * 100 : 0;

  const useLabel = long
    ? t("listingVideoUsePart", { start: formatMmss(draft.startS), end: formatMmss(draft.endS) })
    : t("listingVideoUse");

  return (
    <View className="gap-4" testID="listing-video-editor">
      <View className="flex-row items-center justify-between">
        <Button variant="outline" size="sm" onPress={onCancel} accessibilityLabel={t("cancel")}>
          <Text>{t("cancel")}</Text>
        </Button>
        <Text className="text-body font-semibold">{t("listingVideoTitle")}</Text>
        <Button variant="outline" size="sm" onPress={onChange} accessibilityLabel={t("listingVideoChange")}>
          <Text>{t("listingVideoChange")}</Text>
        </Button>
      </View>

      <View className="w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: 16 / 9 }}>
        <VideoView testID="listing-video-preview" player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previewing ? t("listingVideoPausePreview") : t("listingVideoPlayPreview")}
          onPress={() => { const next = !previewing; setPreviewing(next); try { if (next) { player.currentTime = draft.startS; player.play(); } else player.pause(); } catch { /* stub */ } }}
          className="absolute inset-0 items-center justify-center"
        >
          {!previewing && (<View className="h-14 w-14 items-center justify-center rounded-full bg-white/20"><Icon as={Play} className="size-7 text-white" /></View>)}
          {previewing && (<Text className="absolute bottom-2 text-caption text-white">{t("listingVideoPlaying", { start: formatMmss(draft.startS), end: formatMmss(draft.endS) })}</Text>)}
        </Pressable>
      </View>

      <View>
        <View className="flex-row items-end justify-between">
          <Text className="text-headline">{formatMmss(selectedS)}</Text>
          <Text className={hitMax ? "text-footnote font-semibold" : "text-footnote text-muted-foreground"}>
            {t("listingVideoMax")}
          </Text>
        </View>
        <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">
          {hint}
        </Text>
      </View>

      <View>
        <Pressable
          ref={trackRef}
          style={{ marginHorizontal: 24 }}
          testID="listing-video-trim-track"
          accessibilityRole="button"
          accessibilityLabel={t("listingVideoTimeline")}
          onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
          onPress={(event) => handleTap(event.nativeEvent.locationX)}
          className="relative h-14 w-full overflow-visible rounded-[10px] bg-muted"
        >
          <View className="absolute inset-0 flex-row overflow-hidden rounded-[10px]" accessibilityElementsHidden>
            {filmUris.map((uri, i) => uri ? (<Image key={i} testID="listing-video-filmstrip-frame" source={{ uri }} style={{ flex: 1, height: "100%" }} contentFit="cover" />) : (<View key={i} className="flex-1 border-r border-black/25 bg-secondary" />))}
          </View>
          <View className="absolute top-0 bottom-0 left-0 bg-black/55" style={{ width: `${leftPct}%` }} accessibilityElementsHidden />
          <View
            className="absolute top-0 bottom-0 right-0 bg-black/55"
            style={{ width: `${100 - leftPct - widthPct}%` }}
            accessibilityElementsHidden
          />
          <View
            testID="listing-video-trim-window"
            {...windowHandlers}
            className="absolute -top-[3px] -bottom-[3px]"
            style={{ left: `${leftPct}%`, width: `${widthPct}%`, borderTopWidth: 3, borderBottomWidth: 3, borderColor: FRAME_YELLOW }}
          />
          <View
            testID="listing-video-start-handle"
            {...startHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t("listingVideoStartLabel")}
            accessibilityValue={{ min: startRange[0], max: startRange[1], now: draft.startS, text: t("listingVideoStartsAt", { time: formatMmss(draft.startS) }) }}
            accessibilityActions={[{ name: "increment", label: t("listingVideoStartsAt", { time: formatMmss(draft.startS) }) }, { name: "decrement", label: t("listingVideoStartsAt", { time: formatMmss(draft.startS) }) }]}
            onAccessibilityAction={(event) => onEdgeAccessibilityAction("start", event.nativeEvent.actionName)}
            className="absolute -top-[3px] -bottom-[3px] items-center justify-center rounded-l-[10px]"
            style={{ left: `${leftPct}%`, width: HANDLE_WIDTH, marginLeft: -HANDLE_WIDTH, minHeight: 62, backgroundColor: FRAME_YELLOW }}
          >
            <View className="h-5 w-[3px] rounded bg-black/60" />
          </View>
          <View
            testID="listing-video-end-handle"
            {...endHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t("listingVideoEndLabel")}
            accessibilityValue={{ min: endRange[0], max: endRange[1], now: draft.endS, text: t("listingVideoEndsAt", { time: formatMmss(draft.endS) }) }}
            accessibilityActions={[{ name: "increment", label: t("listingVideoEndsAt", { time: formatMmss(draft.endS) }) }, { name: "decrement", label: t("listingVideoEndsAt", { time: formatMmss(draft.endS) }) }]}
            onAccessibilityAction={(event) => onEdgeAccessibilityAction("end", event.nativeEvent.actionName)}
            className="absolute -top-[3px] -bottom-[3px] items-center justify-center rounded-r-[10px]"
            style={{ left: `${leftPct + widthPct}%`, width: HANDLE_WIDTH, minHeight: 62, backgroundColor: FRAME_YELLOW }}
          >
            <View className="h-5 w-[3px] rounded bg-black/60" />
          </View>
        </Pressable>
        <View className="flex-row justify-between pt-1.5">
          <Text className="text-footnote text-muted-foreground">{formatMmss(draft.startS)}</Text>
          <Text className="text-footnote text-muted-foreground">{formatMmss(draft.endS)}</Text>
        </View>
      </View>

      <View>
        <Text className="text-subhead">{t("listingVideoCover")}</Text>
        <Text className="mb-2 text-footnote text-muted-foreground">{t("listingVideoCoverHint")}</Text>
        <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={t("listingVideoCover")}>
          {covers.map((coverS, index) => {
            const chosen = index === draft.coverIndex;
            return (
              <Pressable
                key={`${index}-${coverS}`}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={t("listingVideoCoverOption", { index: index + 1, time: formatMmss(coverS) })}
                onPress={() => onDraftChange(withCover(draft, index))}
                className="flex-1 items-center justify-center bg-secondary"
                style={{ aspectRatio: 4 / 3, borderRadius: 12, borderWidth: chosen ? 3 : 0, borderColor: FRAME_YELLOW }}
              >
                {coverUris[index] ? (<Image testID="listing-video-cover-image" source={{ uri: coverUris[index] }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} contentFit="cover" />) : null}
                <Text className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-caption text-white">{formatMmss(coverS)}</Text>
                {chosen && (
                  <View className="absolute top-1 right-1 h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: FRAME_YELLOW }}>
                    <Icon as={Check} className="size-3.5 text-black" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button onPress={onUse} disabled={selectedS < LISTING_VIDEO_MIN_S} accessibilityLabel={useLabel}>
        <Text>{useLabel}</Text>
      </Button>
    </View>
  );
}
