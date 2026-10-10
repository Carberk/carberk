import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { GalleryImage } from "./GalleryImage";
import { isNearPhoto } from "./photoWindow";
import { ZoomableImage } from "./ZoomableImage";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ListingMedia = ListingsSchemas.ListingMedia;

const THUMB_WIDTH = 64;
const THUMB_GAP = 6;
const STRIP_PADDING = 12;

export interface PhotoViewerProps {
  visible: boolean;
  media: ListingMedia[];
  /** The photo to open on. */
  initialIndex: number;
  /** Called with the photo the viewer was left on, so the gallery can follow. */
  onClose: (index: number) => void;
  /** Top-right slot, e.g. ♡. Receives a function that closes the viewer. */
  headerAction?: (close: () => void) => ReactNode;
  /** Bottom slot, e.g. Call + Message. Receives a function that closes the viewer. */
  footer?: (close: () => void) => ReactNode;
}

/**
 * Black full-screen photo viewer (approved Listing detail content, AR-11-004):
 * an `n / N` counter, ✕, swipe paging, pinch zoom, a thumbnail strip, and
 * caller-supplied ♡ and contact actions. Pages show the gallery's `detail`
 * size, already cached for the photo that was tapped, and load only the
 * photo on screen and its neighbours. The 2400 px `fullscreen` size loads
 * only once a zoom starts on a photo, and sharpens it in place; the zoom
 * itself never waits for it. A React Native Modal sits above the
 * navigation stack, so anything that leaves this screen must close it first;
 * the slots get `close` for that.
 */
export function PhotoViewer({
  visible,
  media,
  initialIndex,
  onClose,
  headerAction,
  footer,
}: PhotoViewerProps) {
  // The photo the viewer is on lives in the content, which mounts fresh on
  // every open. The system back gesture closes from the Modal itself, so the
  // content mirrors its photo here.
  const indexRef = useRef(initialIndex);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onClose(indexRef.current)}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ViewerContent
          media={media}
          initialIndex={initialIndex}
          indexRef={indexRef}
          onClose={onClose}
          headerAction={headerAction}
          footer={footer}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

function ViewerContent({
  media,
  initialIndex,
  indexRef,
  onClose,
  headerAction,
  footer,
}: Pick<PhotoViewerProps, "media" | "initialIndex" | "onClose" | "headerAction" | "footer"> & {
  indexRef: { current: number };
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  // Photos zoomed at least once, which show the `fullscreen` size from then on.
  const [sharp, setSharp] = useState<ReadonlySet<string>>(() => new Set());
  // Each loaded photo's width / height, for photos the API sent no size for.
  const [loadedRatios, setLoadedRatios] = useState<Record<string, number>>({});
  const [pagerHeight, setPagerHeight] = useState(height * 0.6);
  const pagerRef = useRef<FlatList<ListingMedia>>(null);
  const stripRef = useRef<FlatList<ListingMedia>>(null);

  const close = useCallback(() => onClose(indexRef.current), [onClose, indexRef]);

  const sharpen = useCallback((id: string) => {
    setSharp((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, []);

  const rememberRatio = useCallback((id: string, ratio: number) => {
    setLoadedRatios((current) => (current[id] === ratio ? current : { ...current, [id]: ratio }));
  }, []);

  const moveTo = useCallback(
    (next: number) => {
      indexRef.current = next;
      setIndex(next);
      setZoomed(false);
    },
    [indexRef],
  );

  useEffect(() => {
    indexRef.current = initialIndex;
  }, [initialIndex, indexRef]);

  // Keep the strip's current thumbnail centred as the photo changes, without
  // scrolling past either end.
  useEffect(() => {
    const step = THUMB_WIDTH + THUMB_GAP;
    const contentWidth = STRIP_PADDING * 2 + media.length * step - THUMB_GAP;
    const centred = STRIP_PADDING + step * index - (width - THUMB_WIDTH) / 2;
    const offset = Math.max(0, Math.min(centred, contentWidth - width));
    stripRef.current?.scrollToOffset({ offset, animated: true });
  }, [index, media.length, width]);

  const handleSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < media.length) moveTo(next);
  };

  const selectThumbnail = (next: number) => {
    moveTo(next);
    pagerRef.current?.scrollToIndex({ index: next, animated: false });
  };

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="active:bg-white/20"
          accessibilityLabel={t("close")}
          onPress={close}
        >
          <Icon as={X} className="size-6 text-white" />
        </Button>
        <Text className="flex-1 text-center text-body font-semibold text-white">
          {`${index + 1} / ${media.length}`}
        </Text>
        <View className="h-11 w-11 items-center justify-center">
          {headerAction?.(close)}
        </View>
      </View>

      <View
        className="flex-1"
        onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
      >
        <FlatList
          ref={pagerRef}
          testID="photo-viewer-pager"
          data={media}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, position) => ({
            length: width,
            offset: width * position,
            index: position,
          })}
          onMomentumScrollEnd={handleSwipeEnd}
          extraData={{ index, sharp, loadedRatios }}
          initialNumToRender={1}
          windowSize={3}
          renderItem={({ item, index: position }) => {
            if (!isNearPhoto(position, index)) {
              return <View style={{ width, height: pagerHeight }} />;
            }
            const isSharp = sharp.has(item.id);
            return (
              <ZoomableImage
                width={width}
                height={pagerHeight}
                aspectRatio={
                  item.width && item.height ? item.width / item.height : loadedRatios[item.id]
                }
                active={position === index}
                onZoomChange={setZoomed}
                onZoomStart={() => sharpen(item.id)}
              >
                <GalleryImage
                  item={item}
                  variant={isSharp ? "fullscreen" : "detail"}
                  placeholderVariant={isSharp ? "detail" : undefined}
                  priority={position === index ? "high" : "low"}
                  contentFit="contain"
                  style={{ width: "100%", height: "100%" }}
                  onAspectRatio={(ratio) => rememberRatio(item.id, ratio)}
                />
              </ZoomableImage>
            );
          }}
        />
      </View>

      <FlatList
        ref={stripRef}
        data={media}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: STRIP_PADDING,
          paddingVertical: 8,
          gap: THUMB_GAP,
        }}
        getItemLayout={(_, position) => ({
          length: THUMB_WIDTH + THUMB_GAP,
          offset: STRIP_PADDING + (THUMB_WIDTH + THUMB_GAP) * position,
          index: position,
        })}
        renderItem={({ item, index: position }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("photoOf", { n: position + 1, total: media.length })}
            accessibilityState={{ selected: position === index }}
            onPress={() => selectThumbnail(position)}
            className={cn(
              "h-14 overflow-hidden rounded-md border-2",
              position === index ? "border-white" : "border-transparent opacity-60",
            )}
            style={{ width: THUMB_WIDTH }}
          >
            <GalleryImage
              item={item}
              variant="thumbnail"
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          </Pressable>
        )}
      />

      <View style={{ paddingBottom: insets.bottom }}>{footer?.(close)}</View>
    </View>
  );
}
