import { WizardSchemas, ListingsSchemas } from "@auto-tm/contracts";

import { getStagingPath, listLocalPhotoIds } from "./stagingDir";
import type { StagedPhoto, UploadQueue, PublishGateResult, UploadError } from "./types";
import { NEEDS_ATTENTION_STATES, PENDING_STATES } from "./uploadCounts";

/**
 * Blockers are translation keys, not display text — the wizard screens run them
 * through `translateWizardError` before rendering (ADR-0050).
 */
const { WIZARD_ERROR_KEYS } = WizardSchemas;

export function computePublishGate(queue: UploadQueue): PublishGateResult {
  const blockers: string[] = [];

  const hasPhotos = queue.photos.length > 0;
  if (queue.photos.length < ListingsSchemas.MIN_LISTING_PHOTOS) {
    blockers.push(WIZARD_ERROR_KEYS.photosRequired);
  }

  // A photo waiting for the network has no key yet and would be left out of the
  // Listing, so it counts as an upload in progress like the others.
  const hasPending = queue.photos.some((p) => PENDING_STATES.includes(p.state));
  if (hasPending) {
    blockers.push(WIZARD_ERROR_KEYS.uploadsInProgress);
  }

  // A lost photo can never upload; like a failed one, it waits for the seller to remove it.
  const hasFailed = queue.photos.some((p) => NEEDS_ATTENTION_STATES.includes(p.state));
  if (hasFailed) {
    blockers.push(WIZARD_ERROR_KEYS.uploadsFailed);
  }

  const hasAttached = queue.photos.filter(
    (p) => !!p.key && (p.state === "attached" || p.state === "uploaded"),
  ).length >= ListingsSchemas.MIN_LISTING_PHOTOS;
  if (!hasAttached && hasPhotos) {
    if (!blockers.includes(WIZARD_ERROR_KEYS.photosRequired)) blockers.push(WIZARD_ERROR_KEYS.photosRequired);
  }

  return {
    canPublish: blockers.length === 0,
    blockers,
  };
}

export function reconstructQueueFromDraft(
  stagingKey: string,
  draftPayload: ListingsSchemas.ListingDraftPayload,
  localPhotoIds: string[],
): UploadQueue {
  const photos: StagedPhoto[] = [];
  const payloadPhotos = draftPayload.photos ?? [];

  for (const payloadPhoto of payloadPhotos) {
    const isLocal = localPhotoIds.includes(payloadPhoto.photoId);
    let state: StagedPhoto["state"];

    if (payloadPhoto.key) {
      state = "attached";
    } else if (isLocal) {
      state = "compressed";
    } else {
      state = "lost";
    }

    photos.push({
      photoId: payloadPhoto.photoId,
      key: payloadPhoto.key,
      state,
      sortOrder: payloadPhoto.sortOrder,
      retryCount: 0,
      localUri: isLocal ? getStagingPath(stagingKey, payloadPhoto.photoId) : undefined,
    });
  }

  // A staged file the draft never saved was compressed but not uploaded when the
  // app closed. It comes back ready to upload, with its file, so it can resume.
  for (const localId of localPhotoIds) {
    if (!photos.some((p) => p.photoId === localId)) {
      photos.push({
        photoId: localId,
        state: "compressed",
        sortOrder: photos.length,
        retryCount: 0,
        localUri: getStagingPath(stagingKey, localId),
      });
    }
  }

  // Re-sort by sortOrder
  photos.sort((a, b) => a.sortOrder - b.sortOrder);

  return { stagingKey, photos };
}

export function getPhotosByState(
  queue: UploadQueue,
  state: StagedPhoto["state"],
): StagedPhoto[] {
  return queue.photos.filter((p) => p.state === state);
}

export function findPhotoById(
  queue: UploadQueue,
  photoId: string,
): StagedPhoto | undefined {
  return queue.photos.find((p) => p.photoId === photoId);
}

export function createStagedPhoto(
  photoId: string,
  sortOrder: number,
): StagedPhoto {
  return {
    photoId,
    state: "selected",
    sortOrder,
    retryCount: 0,
  };
}

export function appendPhotoToQueue(
  queue: UploadQueue,
  photo: StagedPhoto,
): UploadQueue {
  return {
    ...queue,
    photos: [...queue.photos, photo],
  };
}

export function updatePhotoState(
  queue: UploadQueue,
  photoId: string,
  state: StagedPhoto["state"],
  updates?: Partial<Omit<StagedPhoto, "photoId" | "state">>,
): UploadQueue {
  return {
    ...queue,
    photos: queue.photos.map((p) =>
      p.photoId === photoId
        ? {
            ...p,
            state,
            ...updates,
            retryCount:
              state === "failed" ? p.retryCount + 1 : p.retryCount,
          }
        : p,
    ),
  };
}

export function transitionPhotoToFailed(
  queue: UploadQueue,
  photoId: string,
  error: UploadError,
): UploadQueue {
  return updatePhotoState(queue, photoId, "failed", { error });
}

export function removePhotoFromQueue(
  queue: UploadQueue,
  photoId: string,
): UploadQueue {
  return {
    ...queue,
    photos: queue.photos
      .filter((p) => p.photoId !== photoId)
      .map((p, index) => ({ ...p, sortOrder: index })),
  };
}

export function reorderPhotos(queue: UploadQueue, photoIds: string[]): UploadQueue {
  const photoMap = new Map(queue.photos.map((p) => [p.photoId, p]));
  const reordered = photoIds
    .map((id) => photoMap.get(id))
    .filter((p): p is StagedPhoto => !!p)
    .map((p, index) => ({ ...p, sortOrder: index }));

  return { ...queue, photos: reordered };
}

/**
 * The photo among `photoIds` that comes first in the grid. A photo no longer
 * in the queue comes before all of them, so its leftover work clears at once.
 */
export function nextInGridOrder(queue: UploadQueue, photoIds: Iterable<string>): string | undefined {
  const position = new Map(queue.photos.map((p, index) => [p.photoId, index]));
  let next: string | undefined;
  let nextPosition = Infinity;
  for (const photoId of photoIds) {
    const at = position.get(photoId) ?? -1;
    if (at < nextPosition) {
      next = photoId;
      nextPosition = at;
    }
  }
  return next;
}

export function getPhotosReadyForUpload(queue: UploadQueue): StagedPhoto[] {
  return queue.photos.filter((p) => p.state === "compressed");
}

export function collectPhotosToResume(queue: UploadQueue): StagedPhoto[] {
  return queue.photos.filter(
    (p) =>
      p.state === "compressed" ||
      p.state === "waiting_for_network" ||
      (p.state === "failed" && p.retryCount < 2 && isRetryable(p.error)),
  );
}

export function transitionUploadQueueToWaitingForNetwork(
  queue: UploadQueue,
): UploadQueue {
  return {
    ...queue,
    photos: queue.photos.map((photo) =>
      photo.state === "compressed" ||
      photo.state === "presigned" ||
      photo.state === "uploading"
        ? { ...photo, state: "waiting_for_network" }
        : photo,
    ),
  };
}

export async function reconstructQueueFromListing(
  listingId: string,
  media: ListingsSchemas.ListingMedia[],
): Promise<UploadQueue> {
  const stagingKey = `edit-${listingId}`;
  const localPhotoIds = await listLocalPhotoIds(stagingKey);

  const photos: StagedPhoto[] = media.map((m) => ({
    photoId: m.id,
    key: m.key,
    state: "attached",
    sortOrder: m.sortOrder,
    retryCount: 0,
    width: m.width,
    height: m.height,
    localUri: localPhotoIds.includes(m.id)
      ? getStagingPath(stagingKey, m.id)
      : undefined,
  }));

  for (const localId of localPhotoIds) {
    if (!photos.some((p) => p.photoId === localId)) {
      photos.push({
        photoId: localId,
        state: "selected",
        sortOrder: photos.length,
        retryCount: 0,
        localUri: getStagingPath(stagingKey, localId),
      });
    }
  }

  photos.sort((a, b) => a.sortOrder - b.sortOrder);

  return { stagingKey, photos };
}

export function isRetryable(error?: UploadError): boolean {
  if (!error) return true;
  return error.retryable;
}
