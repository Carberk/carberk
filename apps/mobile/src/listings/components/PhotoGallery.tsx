import { useCallback, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, View, type ViewToken } from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { GalleryBanner, GalleryCounter, GalleryImage } from "./GalleryImage";
import { NoPhotosFrame, useListingPhotoFrame } from "./ListingPhotoFrame";
import { isNearPhoto } from "./photoWindow";
import { PhotoViewer } from "./PhotoViewer";

type ListingMedia = ListingsSchemas.ListingMedia;

interface PhotoGalleryProps {
  media: ListingMedia[];
  /** Status strip across the bottom of the photo, e.g. "Sold" on a closed Listing. */
  banner?: string;
  /** The photo viewer's top-right action (♡); omit it where the viewer has none. */
  viewerHeaderAction?: (close: () => void) => ReactNode;
  /** The photo viewer's bottom actions (Call + Message); omit them where it has none. */
  viewerFooter?: (close: () => void) => ReactNode;
}

export function PhotoGallery({
  media,
  banner,
  viewerHeaderAction,
  viewerFooter,
}: PhotoGalleryProps) {
  const { t } = useTranslation();
  const frame = useListingPhotoFrame();
  const screenWidth = frame.width;
  const [activeIndex, setActiveIndex] = useState(0);
  // Neighbours wait until the first photo has loaded, so on a slow connection
  // they never share its bandwidth; once the buyer swipes they load anyway.
  const [firstLoaded, setFirstLoaded] = useState(false);
  const loadNeighbours = firstLoaded || activeIndex !== 0;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const listRef = useRef<FlatList<ListingMedia>>(null);

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      const first = info.viewableItems[0];
      if (first?.index != null) {
        setActiveIndex(first.index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Closing the viewer lands the gallery on the photo the viewer was left on.
  const closeViewer = useCallback(
    (index: number) => {
      setViewerIndex(null);
      setActiveIndex(index);
      listRef.current?.scrollToOffset({ offset: index * screenWidth, animated: false });
    },
    [screenWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ListingMedia; index: number }) => {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("photoOf", { n: index + 1, total: media.length })}
          onPress={() => setViewerIndex(index)}
          className="active:opacity-90"
        >
          <View testID="listing-photo-frame" className="bg-muted" style={frame}>
            {(index === activeIndex || (loadNeighbours && isNearPhoto(index, activeIndex))) && (
              <GalleryImage
                item={item}
                variant="detail"
                // The first photo is the card's: its `list` size is cached and shows at once.
                placeholderVariant={index === 0 ? "list" : undefined}
                // Fixed per photo: expo-image restarts a download whose priority
                // changes, so a neighbour keeps `low` once it is on screen.
                priority={index === 0 ? "high" : "low"}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
                inListingFrame
                onAspectRatio={index === 0 ? () => setFirstLoaded(true) : undefined}
              />
            )}
          </View>
        </Pressable>
      );
    },
    [frame, media.length, activeIndex, loadNeighbours, t],
  );

  if (media.length === 0) {
    return <NoPhotosFrame banner={banner} />;
  }

  return (
    <View>
      <FlatList
        ref={listRef}
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={{ activeIndex, loadNeighbours }}
        initialNumToRender={1}
        windowSize={3}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <GalleryCounter
        position={activeIndex + 1}
        total={media.length}
        aboveBanner={Boolean(banner)}
      />

      {banner && <GalleryBanner label={banner} />}

      <PhotoViewer
        visible={viewerIndex !== null}
        media={media}
        initialIndex={viewerIndex ?? 0}
        onClose={closeViewer}
        headerAction={viewerHeaderAction}
        footer={viewerFooter}
      />
    </View>
  );
}
