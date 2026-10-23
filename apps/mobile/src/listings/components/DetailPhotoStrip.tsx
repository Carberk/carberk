import { useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { FlatList, Pressable, View, useWindowDimensions, type ListRenderItem, type ViewToken } from "react-native";
import { useTranslation } from "react-i18next";

import { videoPosterLabel } from "../videoEditor/videoPosterLabel";
import { listingPhotoUrl } from "../detail/buildVariantUrl";

import { GalleryBanner, GalleryImage, type GalleryPhoto } from "./GalleryImage";
import { clippedRadii, intersectRect, minimalStripOffset, type PhotoGeometry } from "./photoTransitionMath";
import { isNearPhoto } from "./photoWindow";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** Listing detail's page margin, in dp: the photos and every section below them start and end here (#864). */
export const DETAIL_MARGIN = 16;
/** The gap between the header row and the photos, in dp. */
export const DETAIL_STRIP_TOP = 8;
/** The square seam between two photos, in dp, as on the Results strip. */
export const DETAIL_STRIP_SEAM = 2;

/**
 * The size of every Listing detail photo tile: the screen less the left
 * margin and the right one, which holds the seam and a sliver of the next
 * photo; 4:3, the phone camera's shape.
 */
export function useDetailPhotoTile() {
  const { width } = useWindowDimensions();
  return useMemo(() => {
    const tileWidth = width - DETAIL_MARGIN * 2;
    return { width: tileWidth, height: (tileWidth * 3) / 4 };
  }, [width]);
}

/** How far down the page the photos end: where the header shows the price and title. */
export function useDetailPhotosBottom() {
  return DETAIL_STRIP_TOP + useDetailPhotoTile().height;
}

/** A photo of the strip, or a photo the Listing has that the tapped card did not know yet. */
export type StripPhoto = (GalleryPhoto & { pending?: false }) | { key: string; pending: true };

/** What a parent can ask of the strip: land on a photo, as when the viewer closes on it. */
export interface DetailPhotoStripHandle {
  scrollToPhoto: (index: number) => void;
  measurePhoto: (index: number, callback: (geometry: PhotoGeometry | null) => void) => void;
}

interface DetailPhotoStripProps {
  photos: readonly StripPhoto[];
  /** Status strip across the bottom of every tile, e.g. "Sold" on a closed Listing. */
  banner?: string | undefined;
  /**
   * A tap on a photo: its index and its tile, so a caller can measure where
   * the photo sits on screen (#869). Without it the photos are not buttons.
   */
  onPressPhoto?: (index: number, tile: View | null) => void;
  ref?: Ref<DetailPhotoStripHandle>;
  hiddenIndex?: number | null;
  visibleTop?: number;
}

/**
 * Listing detail's photos (#864, ADR-0097): a strip of 4:3 tiles inset by
 * the page margin, each photo cover-fit so every one shows at one shape.
 * Photos meet square at a 2 dp seam and only the strip's two outer ends are
 * rounded, as on the Results card strip. It snaps one photo per swipe: the
 * first photo starts at the left margin with a sliver of the next one in the
 * right margin, a middle photo shows a sliver either side, and the last lines
 * up with the right margin. The margin is padding on the scrolling content,
 * so a swipe carries photos through it to the screen edge. One photo is one
 * tile from margin to margin that does not scroll; none is the same tile in
 * grey saying so. A status banner runs across the bottom of each tile,
 * inside its corners.
 *
 * The preview, the loaded detail and the deep-link skeleton draw this one
 * geometry, so no photo moves when detail arrives. Each photo loads the
 * `detail` size the Results card strip already decoded, through the same
 * address (`listingPhotoUrl`), so it paints from memory, over its ThumbHash
 * until it loads. Built for about 2 Mbps (#816): the photo on screen loads
 * first, its neighbours once it has, the rest as the buyer swipes.
 *
 * There is no counter here: each photo reads "Photo n of N" to a screen
 * reader, and the viewer shows `n / N`.
 */
export function DetailPhotoStrip({ photos, banner, onPressPhoto, ref, hiddenIndex, visibleTop = 0 }: DetailPhotoStripProps) {
  const { t, i18n } = useTranslation();
  const tile = useDetailPhotoTile();
  const { width: viewport, height: windowHeight } = useWindowDimensions();
  const interval = tile.width + DETAIL_STRIP_SEAM;
  const [activeIndex, setActiveIndex] = useState(0);
  // Neighbours wait until the first photo has loaded, so on a slow connection
  // they never share its bandwidth; once the buyer swipes they load anyway.
  const [firstLoaded, setFirstLoaded] = useState(false);
  const loadNeighbours = firstLoaded || activeIndex !== 0;
  const listRef = useRef<FlatList<StripPhoto>>(null);
  const tiles = useRef(new Map<number, View>());
  const container = useRef<View>(null);
  const offset = useRef(0);
  const ratios = useRef(new Map<number, number>());
  const uris = useRef(new Map<number, string>());
  const measurePhoto = useCallback((index: number, callback: (geometry: PhotoGeometry | null) => void) => {
    const photo = photos[index];
    const node = tiles.current.get(index);
    if (!photo || photo.pending || !node || !container.current) { callback(null); return; }
    container.current.measureInWindow((sx, sy, sw, sh) => {
      node.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) { callback(null); return; }
        const full = { x, y, width, height };
        const visible = intersectRect(full, intersectRect({ x: sx, y: sy, width: sw, height: sh }, { x: 0, y: visibleTop, width: viewport, height: Math.max(0, windowHeight - visibleTop) }));
        const ends: PhotoGeometry["radii"] = [index === 0 ? 12 : 0, index === photos.length - 1 ? 12 : 0, index === photos.length - 1 ? 12 : 0, index === 0 ? 12 : 0];
        callback({ tile: full, visible, radii: clippedRadii(full, visible, ends), ratioKnown: !!(photo.width && photo.height) || ratios.current.has(index), uri: uris.current.get(index) ?? listingPhotoUrl(photo, "detail"), ratio: photo.width && photo.height ? photo.width / photo.height : ratios.current.get(index) ?? 4 / 3 });
      });
    });
  }, [photos, visibleTop, viewport, windowHeight]);

  useImperativeHandle(ref, () => ({
    scrollToPhoto: (index) => {
      setActiveIndex(index);
      const next = minimalStripOffset(index, offset.current, tile.width, DETAIL_STRIP_SEAM, DETAIL_MARGIN, viewport, DETAIL_MARGIN * 2 + photos.length * interval - DETAIL_STRIP_SEAM);
      offset.current = next;
      listRef.current?.scrollToOffset({ offset: next, animated: false });
    },
    measurePhoto,
  }), [interval, tile.width, viewport, photos.length, measurePhoto]);

  const onViewableItemsChanged = useCallback((info: { viewableItems: ViewToken[] }) => {
    const shown = info.viewableItems[0];
    if (shown?.index != null) setActiveIndex(shown.index);
  }, []);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const count = photos.length;
  const renderItem = useCallback<ListRenderItem<StripPhoto>>(({ item, index }) => {
    const label = t("photoOf", { n: index + 1, total: count });
    const value = banner ? { text: banner } : undefined;
    const frame = (
      <View
        ref={(node) => {
          if (node) tiles.current.set(index, node);
          else tiles.current.delete(index);
        }}
        collapsable={false}
        testID={item.pending ? "listing-photo-tile-pending" : "listing-photo-tile"}
        style={{ width: tile.width, height: tile.height, ...(index === hiddenIndex ? { opacity: 0 } : {}) }}
        className={cn("overflow-hidden bg-muted", tileEnds(index, count))}
      >
        {!item.pending && (index === activeIndex || (loadNeighbours && isNearPhoto(index, activeIndex))) && (
          <GalleryImage
            item={item}
            variant="detail"
            // Fixed per photo: expo-image restarts a download whose priority
            // changes, so a neighbour keeps `low` once it is on screen.
            priority={index === 0 ? "high" : "low"}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            onAspectRatio={(ratio) => { ratios.current.set(index, ratio); if (index === 0) setFirstLoaded(true); }}
            onDisplayedUri={(uri) => uris.current.set(index, uri)}
          />
        )}
        {!item.pending && item.kind === "video" ? <View className="absolute bottom-3 left-3 rounded-md bg-black/70 px-3 py-2"><Text className="font-bold text-white">▶ {Math.ceil((item.durationMs ?? 0) / 1000)}s</Text></View> : null}
        {banner && <GalleryBanner label={banner} hidden />}
      </View>
    );
    if (!onPressPhoto || item.pending) {
      return <View accessible accessibilityRole="image" accessibilityLabel={label} accessibilityValue={value}>{frame}</View>;
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={!item.pending && item.kind === "video" ? videoPosterLabel(item.durationMs, i18n.language) : label}
        accessibilityValue={value}
        onPress={() => onPressPhoto(index, tiles.current.get(index) ?? null)}
        className="active:opacity-90"
      >
        {frame}
      </Pressable>
    );
  }, [t, i18n.language, count, banner, tile, activeIndex, loadNeighbours, onPressPhoto, hiddenIndex]);

  if (count === 0) {
    return (
      <DetailPhotos>
        <View
          testID="listing-photo-tile"
          style={{ width: tile.width, height: tile.height }}
          className="mx-4 items-center justify-center overflow-hidden rounded-xl bg-muted"
        >
          <Text className="text-callout text-muted-foreground">{t("noPhotos")}</Text>
          {banner && <GalleryBanner label={banner} />}
        </View>
      </DetailPhotos>
    );
  }

  return (
    <View ref={container} collapsable={false} testID="detail-photos" style={PHOTOS}>
      <FlatList
        ref={listRef}
        testID="detail-photo-strip"
        horizontal
        data={photos}
        keyExtractor={(item, index) => (item.pending ? `pending-${index}` : item.key)}
        renderItem={renderItem}
        extraData={{ activeIndex, loadNeighbours, hiddenIndex }}
        onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
        ItemSeparatorComponent={StripSeam}
        contentContainerStyle={STRIP_CONTENT}
        getItemLayout={(_, index) => ({ length: tile.width, offset: DETAIL_MARGIN + interval * index, index })}
        scrollEnabled={count > 1}
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={2}
        windowSize={3}
      />
    </View>
  );
}

/** The deep-link skeleton's photos: one grey tile from margin to margin, breathing while detail loads. */
export function DetailPhotoStripSkeleton() {
  const tile = useDetailPhotoTile();
  return (
    <DetailPhotos>
      <Skeleton testID="listing-photo-tile" className="mx-4 rounded-xl" style={{ width: tile.width, height: tile.height }} />
    </DetailPhotos>
  );
}

/** The row the photos sit in, 8 dp under the header. */
function DetailPhotos({ children }: { children: ReactNode }) {
  return <View testID="detail-photos" style={PHOTOS}>{children}</View>;
}

/** Only the strip's two outer ends are rounded; one photo is rounded all round. */
function tileEnds(index: number, count: number) {
  if (count === 1) return "rounded-xl";
  return cn(index === 0 && "rounded-l-xl", index === count - 1 && "rounded-r-xl");
}

const PHOTOS = { paddingTop: DETAIL_STRIP_TOP };
/** The margin is padding on the scrolling content, so a swipe carries the photos through it. */
const STRIP_CONTENT = { paddingHorizontal: DETAIL_MARGIN };
const STRIP_SEAM = { width: DETAIL_STRIP_SEAM };

function StripSeam() {
  return <View style={STRIP_SEAM} />;
}
