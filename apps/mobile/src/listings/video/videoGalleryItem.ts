import type { ListingVideoCover, VideoCoverUrls } from "./useListingVideoCover";

/** A Listing's Ready video as one gallery item: its cover stands where a photo would. */
export interface VideoGalleryItem {
  kind: "video-cover";
  id: string;
  key: string;
  durationMs: number;
  cover?: VideoCoverUrls | undefined;
}

export function isVideoGalleryItem(item: object | undefined): item is VideoGalleryItem {
  return !!item && "kind" in item && item.kind === "video-cover";
}

/** The place a Ready video takes in every gallery: after the cover photo (`galleryIndex: 1`, #1043). */
export const VIDEO_GALLERY_INDEX = 1;

/**
 * The photos with the video inserted second, as Results, detail and the
 * full-screen viewer all count it. Without a video, the photos unchanged.
 */
export function withVideoItem<T>(photos: readonly T[], videoId: string | undefined, video: ListingVideoCover | undefined): (T | VideoGalleryItem)[] {
  if (!video || !videoId || photos.length === 0) return [...photos];
  const item: VideoGalleryItem = { kind: "video-cover", id: `video-${videoId}`, key: `video-${videoId}`, durationMs: video.durationMs, cover: video.cover };
  return [...photos.slice(0, VIDEO_GALLERY_INDEX), item, ...photos.slice(VIDEO_GALLERY_INDEX)];
}
