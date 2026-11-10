import { Enums, type ListingsSchemas } from "@auto-tm/contracts";
import { useCallback, useMemo } from "react";
import { FlatList, Pressable, View, useWindowDimensions, type ListRenderItem } from "react-native";
import { useTranslation } from "react-i18next";

import { useListingVideoCover } from "../video/useListingVideoCover";
import { VideoCover } from "../video/VideoCover";

import { ListingPhoto, PhotoChip } from "./ListingPhoto";

import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";
import { cn } from "@/lib/utils";

/** The page margin either side of a Results card, in dp: none, the card spans the screen as on Auto.ru. */
export const CARD_INSET = 0;
/** The gap between the card's top and left edges and the first photo, in dp. */
export const STRIP_INSET = 8;
/** The share of the card width one photo takes: a little over half, so close to half of the next photo shows at rest. */
export const STRIP_PHOTO_SHARE = 0.61;
/** The strip height as a share of the card width: a 4:3 photo at 61% of the width, about 184 dp on a 402 dp screen. */
export const STRIP_HEIGHT_SHARE = 0.4575;
/** The seam between two photos, in dp: a thin line of the card, as on Auto.ru. */
export const STRIP_GAP = 2;

type StripVideo = { durationMs: number; uri?: string | undefined };
type Tile =
  | { kind: "photo"; key: string; thumbHash?: string }
  | ({ kind: "video" } & StripVideo)
  | { kind: "more"; count: number };

/**
 * The tiles of a strip: every photo key in order with its ThumbHash, then
 * "+N" when the Listing has more than the strip shows. A Ready video sits
 * second, after the cover photo, as it does on detail (#1051). When the feed
 * sent fewer keys than the Listing has photos, the video takes one of those
 * places rather than lengthening the strip, so "+N" counts it with the photos.
 */
export function stripTiles(photoKeys: readonly string[], photoCount: number, thumbHashes: readonly (string | null)[] = [], video?: StripVideo): Tile[] {
  const photos: Tile[] = photoKeys.map((key, index) => {
    const thumbHash = thumbHashes[index];
    return thumbHash ? { kind: "photo", key, thumbHash } : { kind: "photo", key };
  });
  if (photos.length === 0) return photos;
  const media: Tile[] = video ? [photos[0] as Tile, { kind: "video", ...video }, ...photos.slice(1)] : photos;
  const total = photoCount + (video ? 1 : 0);
  // The places the feed's keys make, never fewer than the cover photo and the video.
  const places = photoCount > photoKeys.length ? Math.max(photoKeys.length, video ? 2 : 1) : media.length;
  const tiles = media.slice(0, places);
  if (total > tiles.length) tiles.push({ kind: "more", count: total - tiles.length });
  return tiles;
}

interface ListingPhotoStripProps {
  /** The Listing, whose Ready video cover the strip asks for. */
  listingId: string;
  /** The Listing read's Ready video; it shows second and opens the Listing on it. */
  video?: ListingsSchemas.ReadyListingVideo | undefined;
  photoKeys: readonly string[];
  /** ThumbHashes parallel to `photoKeys`; a missing or null slot has no blurred preview. */
  thumbHashes?: readonly (string | null)[];
  photoCount: number;
  /** The seller stated the car is new: a quiet chip says so on the photos. */
  condition?: Enums.ListingCondition;
  onOpen: () => void;
  /** A tap on the video cover: open the Listing with the video selected. It never plays here. */
  onOpenVideo: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

/**
 * The photos at the top of a Results card, set in from the card's top and
 * left edges by `STRIP_INSET`. Photos meet square at a thin seam; only the two
 * outer ends of the strip are rounded (the card's 28 dp radius less the inset). One photo fills the frame between the
 * insets. Two or more scroll sideways: each is 61% of the card wide so close
 * to half of the next one shows, they snap one photo per swipe, and a
 * "+N photos" tile ends the strip when the Listing has more photos than the
 * feed sent. The tile, like any photo, opens the Listing through its own tap
 * target. The scrolling container has no detail-opening press handler above it.
 *
 * The inset is padding on the scrolling content, not on the frame around it.
 * At rest the first photo stands clear of the card's left edge; in a swipe
 * the photos travel under that gap and out to the card's right edge, where
 * the card's own rounded corners clip them.
 *
 * The strip is a horizontal list inside the vertical Results list. A
 * horizontal scroll view only claims a drag that moves sideways, so a
 * vertical drag that starts on a photo still scrolls Results on iOS and on
 * Android; `nestedScrollEnabled` keeps Android from handing the gesture to
 * the outer list once the strip has taken it.
 *
 * A seller-stated "New" sits on the photos' bottom edge, fixed while the
 * photos move under them; it takes no touches. The strip shows no photo
 * count: the "+N photos" tile says there are more, and the full-screen viewer
 * counts.
 *
 * A Ready video shows second as its cover with Play and its duration. Unlike
 * a photo it is its own button ("Video, 42 seconds") because it opens the
 * Listing on the video, not on the cover photo. Only the cover loads here.
 */
export function ListingPhotoStrip({ listingId, video, photoKeys, thumbHashes, photoCount, condition, onOpen, onOpenVideo, onPressIn, onPressOut }: ListingPhotoStripProps) {
  const { t } = useTranslation();
  const videoCover = useListingVideoCover(listingId, video);
  const durationMs = videoCover?.durationMs;
  const coverUri = videoCover?.cover?.detail;
  const stripVideo = useMemo(() => durationMs === undefined ? undefined : { durationMs, uri: coverUri }, [durationMs, coverUri]);
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - CARD_INSET * 2;
  const height = Math.round(cardWidth * STRIP_HEIGHT_SHARE);
  const photoWidth = Math.round(cardWidth * STRIP_PHOTO_SHARE);
  const tiles = useMemo(() => stripTiles(photoKeys, photoCount, thumbHashes, stripVideo), [photoKeys, photoCount, thumbHashes, stripVideo]);
  const interval = photoWidth + STRIP_GAP;

  // Photos meet square at a thin seam; only the strip's two outer ends are rounded.
  const renderItem = useCallback<ListRenderItem<Tile>>(({ item, index }) => {
    const ends = cn(index === 0 && "rounded-l-xl", index === tiles.length - 1 && "rounded-r-xl");
    if (item.kind === "video") {
      return <Pressable accessibilityRole="button" accessibilityLabel={t("listingVideoTile", { count: Math.round(item.durationMs / 1000) })}
        accessibilityHint={t("listingVideoOpensListing")} onPress={onOpenVideo} onPressIn={onPressIn} onPressOut={onPressOut}>
        <View testID="listing-video-tile" style={{ width: photoWidth, height }} className={cn("overflow-hidden", ends)}>
          <VideoCover uri={item.uri} durationMs={item.durationMs} />
        </View>
      </Pressable>;
    }
    return <Pressable
    accessible={false} onPress={onOpen} onPressIn={onPressIn} onPressOut={onPressOut}
  >{item.kind === "photo"
    ? <View testID="listing-photo" style={{ width: photoWidth, height }} className={cn("overflow-hidden bg-secondary", ends)}>
      <ListingPhoto mediaKey={item.key} thumbHash={item.thumbHash} emptyLabel={t("noPhotos")} variant="detail" />
    </View>
    : <View testID="listing-photo-more" style={{ width: photoWidth, height }} className={cn("items-center justify-center gap-0.5 bg-secondary", ends)}>
      <Text className="font-heading text-title font-semibold text-foreground" style={tabularFigures}>{`+${item.count}`}</Text>
      <Text className="text-footnote text-muted-foreground">{t("photos")}</Text>
    </View>}</Pressable>;
  }, [height, photoWidth, tiles.length, t, onOpen, onOpenVideo, onPressIn, onPressOut]);

  // 8 dp inside the first photo's corner at rest, which also lines the chip up with the text below.
  const chips = <View pointerEvents="none" className="absolute bottom-2 left-4 flex-row gap-1.5">
    {condition === Enums.ListingCondition.New ? <PhotoChip label={t("new")} className="relative" /> : null}
  </View>;

  if (tiles.length < 2) {
    const only = tiles[0];
    // Every card keeps the strip's height, so a card without a photo lines up with its neighbours
    // and the list does not change rhythm; the frame's tone and the quiet mark say there is no picture.
    return <View testID="listing-photos" style={{ height, marginTop: STRIP_INSET }}>
      <Pressable accessible={false} onPress={onOpen} onPressIn={onPressIn} onPressOut={onPressOut}
        testID="listing-photo" className="mx-2 h-full overflow-hidden rounded-xl bg-secondary">
        <ListingPhoto mediaKey={only?.kind === "photo" ? only.key : undefined} thumbHash={only?.kind === "photo" ? only.thumbHash : undefined}
          emptyLabel={t("noPhotos")} variant="detail" />
      </Pressable>
      {chips}
    </View>;
  }

  return <View testID="listing-photos" style={{ height, marginTop: STRIP_INSET }}>
    <FlatList
      testID="listing-photo-strip"
      horizontal
      data={tiles}
      keyExtractor={(item) => item.kind === "photo" ? item.key : item.kind}
      renderItem={renderItem}
      ItemSeparatorComponent={StripSeam}
      contentContainerStyle={STRIP_CONTENT}
      getItemLayout={(_, index) => ({ length: photoWidth, offset: STRIP_INSET + interval * index, index })}
      snapToInterval={interval}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      initialNumToRender={3}
      maxToRenderPerBatch={2}
      windowSize={3}
    />
    {chips}
  </View>;
}

/** The inset is padding on the scrolling content, so a swipe carries the photos through it. */
const STRIP_CONTENT = { paddingHorizontal: STRIP_INSET };

const STRIP_SEAM = { width: STRIP_GAP };

function StripSeam() {
  return <View style={STRIP_SEAM} />;
}
