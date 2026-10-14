import { useCallback, useRef, useState, type ReactNode } from "react";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { DetailPhotoStrip, type DetailPhotoStripHandle } from "./DetailPhotoStrip";
import { PhotoViewer } from "./PhotoViewer";

type ListingMedia = ListingsSchemas.ListingMedia;

interface PhotoGalleryProps {
  media: ListingMedia[];
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
  banner,
  viewerHeaderAction,
  viewerFooter,
}: PhotoGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const stripRef = useRef<DetailPhotoStripHandle>(null);

  const openViewer = useCallback((index: number) => setViewerIndex(index), []);
  const closeViewer = useCallback((index: number) => {
    setViewerIndex(null);
    stripRef.current?.scrollToPhoto(index);
  }, []);

  return (
    <>
      <DetailPhotoStrip ref={stripRef} photos={media} banner={banner} onPressPhoto={openViewer} />
      {media.length > 0 && (
        <PhotoViewer
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
