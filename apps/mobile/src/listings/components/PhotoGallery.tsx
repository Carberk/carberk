import { useCallback, useRef, useState, type ReactNode } from "react";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { DetailPhotoStrip, type DetailPhotoStripHandle } from "./DetailPhotoStrip";
import type { PhotoGeometry } from "./photoTransitionMath";
import { PhotoViewer } from "./PhotoViewer";

type ListingMedia = ListingsSchemas.ListingMedia;

interface PhotoGalleryProps {
  media: ListingMedia[];
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
 */
export function PhotoGallery({
  media,
  visibleTop,
  banner,
  viewerHeaderAction,
  viewerFooter,
}: PhotoGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [origin, setOrigin] = useState<PhotoGeometry | null>(null);
  const [hiddenIndex, setHiddenIndex] = useState<number | null>(null);
  const returns = useRef(new Map<number, PhotoGeometry>());
  const stripRef = useRef<DetailPhotoStripHandle>(null);

  const prepareReturn = useCallback((index: number) => {
    stripRef.current?.scrollToPhoto(index);
    requestAnimationFrame(() => stripRef.current?.measurePhoto(index, (geometry) => {
      if (geometry) returns.current.set(index, geometry);
      else returns.current.delete(index);
    }));
  }, []);
  const openViewer = useCallback((index: number) => {
    setOrigin(null);
    returns.current.clear();
    stripRef.current?.measurePhoto(index, (geometry) => {
      if (geometry) returns.current.set(index, geometry);
      setOrigin(geometry?.ratioKnown === false ? null : geometry);
    });
    setViewerIndex(index);
  }, []);
  const closeViewer = useCallback((index: number) => {
    setViewerIndex(null);
    setHiddenIndex(null);
    stripRef.current?.scrollToPhoto(index);
  }, []);

  return (
    <>
      <DetailPhotoStrip visibleTop={visibleTop} hiddenIndex={hiddenIndex} ref={stripRef} photos={media} banner={banner} onPressPhoto={openViewer} />
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
          headerAction={viewerHeaderAction}
          footer={viewerFooter}
        />
      )}
    </>
  );
}
