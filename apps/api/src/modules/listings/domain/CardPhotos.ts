import type { MediaKind } from "./types";

/** Card surfaces carry at most this many photo keys; `photoCount` carries the total. */
export const CARD_PHOTO_KEY_LIMIT = 2;

/** The Results photo strip carries at most this many photo keys. */
export const CARD_GALLERY_KEY_LIMIT = 8;

export interface CardPhotos {
  /** First media key of any kind, kept for conversations and owner cards. */
  coverMediaKey?: string;
  /** Keys of the first photos (`image` media) in `sortOrder`, capped at `CARD_PHOTO_KEY_LIMIT`. */
  photoKeys: string[];
  /** ThumbHashes parallel to `photoKeys`, null for a photo without one; absent while none has one. */
  photoThumbHashes?: (string | null)[];
  /** Keys of the first photos in `sortOrder`, capped at `CARD_GALLERY_KEY_LIMIT`. */
  galleryKeys: string[];
  /** ThumbHashes parallel to `galleryKeys`, as `photoThumbHashes` is to `photoKeys`. */
  galleryThumbHashes?: (string | null)[];
  photoCount: number;
}

type CardMedia = ReadonlyArray<{ key: string; kind: MediaKind; thumbHash?: string | null }>;

/** One slot per photo, or nothing when no photo in the list has a hash yet. */
function thumbHashSlots(photos: CardMedia): (string | null)[] | undefined {
  const slots = photos.map((photo) => photo.thumbHash ?? null);
  return slots.some((slot) => slot !== null) ? slots : undefined;
}

/**
 * Derives the card photo fields from ALL of a Listing's media, ordered by
 * `sortOrder` ascending. `photoCount` is the number of photos in `media`, so
 * a truncated list belongs to `toCardPhotosFromFirstMedia`.
 */
export function toCardPhotos(media: CardMedia): CardPhotos {
  return toCardPhotosFromFirstMedia(
    media,
    media.filter((m) => m.kind === "image").length,
  );
}

/**
 * Derives the card photo fields from the start of a Listing's media, as a
 * bounded read returns it: the first media item and at least the first
 * `CARD_GALLERY_KEY_LIMIT` photos, ordered by `sortOrder` ascending.
 * `photoCount` is the Listing's photo total, which the list cannot show.
 */
export function toCardPhotosFromFirstMedia(
  firstMedia: CardMedia,
  photoCount: number,
): CardPhotos {
  const photos = firstMedia.filter((m) => m.kind === "image");
  const cardPhotos = photos.slice(0, CARD_PHOTO_KEY_LIMIT);
  const galleryPhotos = photos.slice(0, CARD_GALLERY_KEY_LIMIT);
  const photoThumbHashes = thumbHashSlots(cardPhotos);
  const galleryThumbHashes = thumbHashSlots(galleryPhotos);
  const cover = firstMedia[0]?.key;

  return {
    ...(cover ? { coverMediaKey: cover } : {}),
    photoKeys: cardPhotos.map((m) => m.key),
    ...(photoThumbHashes ? { photoThumbHashes } : {}),
    galleryKeys: galleryPhotos.map((m) => m.key),
    ...(galleryThumbHashes ? { galleryThumbHashes } : {}),
    photoCount,
  };
}
