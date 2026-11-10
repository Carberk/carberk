import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { router, useIsFocused } from "expo-router";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { useListingVideoCover } from "../video/useListingVideoCover";
import { isVideoGalleryItem, VIDEO_GALLERY_INDEX, withVideoItem } from "../video/videoGalleryItem";

import { DetailPhotoStrip, type DetailPhotoStripHandle } from "./DetailPhotoStrip";
import type { PhotoGeometry } from "./photoTransitionMath";
import { PhotoViewer } from "./PhotoViewer";

type ListingMedia = ListingsSchemas.ListingMedia;

interface PhotoGalleryProps {
  media: ListingMedia[];
  /** The Listing whose Ready video plays from the strip and the viewer. */
  listingId?: string;
  /** The Listing read's Ready video, shown second among the photos. */
  video?: ListingsSchemas.ReadyListingVideo | undefined;
  /** The viewer owns this Listing: the cover and the player use owner-preview. */
  isOwner?: boolean;
  /** The Listing's status: a non-owner sees the video only while it is active or sold. */
  status?: string | undefined;
  /** Open on the video, as when a card's video cover was tapped. */
  startOnVideo?: boolean;
  visibleTop?: number;
  /** Status strip across the bottom of each photo, e.g. "Sold" on a closed Listing. */
  banner?: string;
  /** The photo viewer's top-right action (♡); omit it where the viewer has none. */
  viewerHeaderAction?: (close: () => void) => ReactNode;
  /** The photo viewer's bottom actions (Call + Message); omit them where it has none. */
  viewerFooter?: (close: () => void) => ReactNode;
}

/**
 * Loaded Listing detail's photos: the inset strip (`DetailPhotoStrip`), and
 * the full-screen viewer a tapped photo opens on. Closing the viewer lands
 * the strip on the photo the viewer was left on.
 *
 * A Ready video is the second item of both (#1051). On the strip its Play
 * opens the player route; in the viewer, arriving on it shows the cover and
 * Play, and Play closes the viewer for the player. When the player closes and
 * detail is on screen again, the viewer reopens on the video.
 */
export function PhotoGallery({
  media: photos,
  listingId,
  video,
  isOwner = false,
  status,
  startOnVideo = false,
  visibleTop,
  banner,
  viewerHeaderAction,
  viewerFooter,
}: PhotoGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [origin, setOrigin] = useState<PhotoGeometry | null>(null);
  const [hiddenIndex, setHiddenIndex] = useState<number | null>(null);
  const returns = useRef(new Map<number, PhotoGeometry>());
  const openingRequest = useRef(0);
  const stripRef = useRef<DetailPhotoStripHandle>(null);
  const videoCover = useListingVideoCover(listingId ?? "", listingId ? video : undefined, { isOwner, status, timedRefresh: true });
  const media = useMemo(() => withVideoItem(photos, video?.id, videoCover), [photos, video?.id, videoCover]);
  const hasVideo = isVideoGalleryItem(media[VIDEO_GALLERY_INDEX]);
  // The viewer item the player was opened from, reopened when detail is focused again.
  const resumeIndex = useRef<number | null>(null);
  const focused = useIsFocused();

  const prepareReturn = useCallback((index: number) => {
    stripRef.current?.scrollToPhoto(index);
    // The strip scroll crosses native frames before the tile lands; measuring
    // after one frame can still read the pre-scroll position and make the
    // close fade instead of flying into the current tile.
    requestAnimationFrame(() => requestAnimationFrame(() => stripRef.current?.measurePhoto(index, (geometry) => {
      if (geometry) returns.current.set(index, geometry);
      else returns.current.delete(index);
    })));
  }, []);
  const openViewer = useCallback((index: number) => {
    setOrigin(null);
    returns.current.clear();
    const request = ++openingRequest.current;
    let presented = false;
    const present = () => {
      if (presented || request !== openingRequest.current) return;
      presented = true;
      setViewerIndex(index);
    };
    stripRef.current?.measurePhoto(index, (geometry) => {
      if (presented || request !== openingRequest.current) return;
      if (geometry) returns.current.set(index, geometry);
      setOrigin(geometry?.ratioKnown === false ? null : geometry);
      present();
    });
    // Fabric measurements may cross native frames. Give both nested reads a
    // frame before presenting; a missing/virtualized ref still opens by fade.
    requestAnimationFrame(() => requestAnimationFrame(present));
  }, []);
  const closeViewer = useCallback((index: number) => {
    setViewerIndex(null);
    setHiddenIndex(null);
    stripRef.current?.scrollToPhoto(index);
  }, []);
  const openPlayer = useCallback(() => {
    if (listingId) router.push(isOwner ? `/(public)/listings/${listingId}/video?audience=owner-preview` : `/(public)/listings/${listingId}/video`);
  }, [listingId, isOwner]);
  // The viewer is a Modal above the navigation stack, so the player can show only once it has closed.
  const playFromViewer = useCallback((index: number) => {
    resumeIndex.current = index;
    closeViewer(index);
    openPlayer();
  }, [closeViewer, openPlayer]);
  useEffect(() => {
    if (!focused || resumeIndex.current === null) return;
    const index = resumeIndex.current;
    resumeIndex.current = null;
    setOrigin(null);
    setViewerIndex(index);
  }, [focused]);

  return (
    <>
      <DetailPhotoStrip visibleTop={visibleTop} hiddenIndex={hiddenIndex} ref={stripRef} photos={media} banner={banner} onPressPhoto={openViewer}
        onPressVideo={openPlayer} initialIndex={startOnVideo && hasVideo ? VIDEO_GALLERY_INDEX : 0} />
      {media.length > 0 && (
        <PhotoViewer
          key={viewerIndex === null ? "closed" : `open-${viewerIndex}`}
          origin={origin}
          getReturnGeometry={(index) => returns.current.get(index) ?? null}
          onIndexChange={prepareReturn}
          onTileHidden={setHiddenIndex}
          visible={viewerIndex !== null}
          media={media}
          initialIndex={viewerIndex ?? 0}
          onClose={closeViewer}
          onPlayVideo={playFromViewer}
          headerAction={viewerHeaderAction}
          footer={viewerFooter}
        />
      )}
    </>
  );
}
