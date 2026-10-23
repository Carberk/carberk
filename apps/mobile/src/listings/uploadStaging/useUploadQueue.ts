import { useCallback, useEffect, useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { beginPhotoMeasurement } from "../../measurement/nativeMeasurement";
import { usePresignUpload } from "../../api/uploads/usePresignUpload";
import { ApiError } from "../../api/client";

import { setupUploadResume } from "./appStateResume";
import { useAsyncCounter } from "./useAsyncCounter";
import { compressPhoto, CompressionError } from "./compressor";
import {
  computePublishGate,
  reconstructQueueFromDraft,
  removePhotoFromQueue,
  reorderPhotos as reorderPhotosInQueue,
  updatePhotoState,
  transitionPhotoToFailed,
  createStagedPhoto,
  appendPhotoToQueue,
  findPhotoById,
  nextInGridOrder,
  collectPhotosToResume,
  transitionUploadQueueToWaitingForNetwork,
} from "./queueState";
import {
  deleteDraftDir,
  ensureDraftDir,
  getStagingPath,
  listLocalPhotoIds,
} from "./stagingDir";
import { buildUploadError } from "./uploadErrors";
import type { PublishGateResult, UploadQueue, UploadError } from "./types";
export { reconstructQueueFromListing } from "./queueState";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function verifyStagingFileExists(localUri: string): Promise<boolean> {
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  return fileInfo.exists;
}

const UPLOAD_TIMEOUT_MS = 60_000;

interface CompressionJob {
  sourceUri: string;
  /** The draft the photo was picked into. */
  stagingKey: string;
  /** Ends the photo's part of `isCompressing` and settles its `addPhoto`. */
  settle: () => void;
}

async function uploadFileToPresignedUrl(
  uploadUrl: string,
  localUri: string,
  headers?: Record<string, string>,
): Promise<void> {
  const uploadPromise = FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: headers ?? {
      "Content-Type": "image/webp",
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new ApiError("NETWORK_ERROR", 0, "Upload timed out")),
      UPLOAD_TIMEOUT_MS,
    ),
  );

  const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);

  if (uploadResult.status >= 400) {
    throw new Error(`PUT failed: ${uploadResult.status}`);
  }
}

export interface UploadQueueOptions {
  /**
   * Restore local photos left in this staging directory by an earlier session
   * (default). An edit session passes false: nothing outside the session can
   * finish uploading or attaching those files, so they are deleted instead of
   * coming back as photos that never upload.
   */
  restoreLocalPhotos?: boolean;
  businessId?: string | undefined;
}

export function useUploadQueue(
  stagingKey: string,
  initialPayload: ListingsSchemas.ListingDraftPayload,
  { restoreLocalPhotos = true, businessId }: UploadQueueOptions = {},
) {
  const { t } = useTranslation("common");
  const [queue, setQueue] = useState<UploadQueue>({ stagingKey, photos: [] });
  // The staging key whose saved and staged photos are in the queue.
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const { increment: startCompression, decrement: endCompression, isActive: isCompressing } = useAsyncCounter();
  const { increment: startUpload, decrement: endUpload, isActive: isUploading } = useAsyncCounter();

  const initializedStagingKey = useRef<string | null>(null);
  const initializingStagingKeys = useRef(new Set<string>());
  const activeStagingKey = useRef(stagingKey);
  const presignMutation = usePresignUpload();
  const queueRef = useRef(queue);
  queueRef.current = queue;
  activeStagingKey.current = stagingKey;

  // Picked photos compress one at a time and upload two at a time, each taking
  // the waiting photo that comes first in the grid. The cover finishes first,
  // progress follows the grid, and a reorder changes what goes next (#819).
  const MAX_CONCURRENT = 2;
  const runningUploads = useRef(0);
  const uploadQueue = useRef<string[]>([]);
  const compressing = useRef(false);
  // Picked photos waiting to be compressed: photo id → its job.
  const compressionWaiting = useRef(new Map<string, CompressionJob>());
  const compressPhotoRef = useRef<(photoId: string, job: CompressionJob) => Promise<void>>(
    async () => {},
  );
  // Photo ids waiting in `uploadQueue` or being uploaded right now.
  const uploadsInFlight = useRef(new Set<string>());
  const networkAvailable = useRef(true);
  const uploadPhotoRef = useRef<(photoId: string) => Promise<void>>(
    async () => {},
  );

  const processUploadQueue = useCallback(() => {
    while (
      runningUploads.current < MAX_CONCURRENT &&
      uploadQueue.current.length > 0
    ) {
      // Hold every other upload until the current cover has finished. Starting
      // it first with two slots would still let a faster second photo overtake
      // it. A failed cover releases the queue so its retry cannot stall others.
      const cover = queueRef.current.photos[0];
      const coverPending = cover && !["uploaded", "attached", "failed", "lost"].includes(cover.state);
      if (coverPending && (!uploadQueue.current.includes(cover.photoId) || runningUploads.current > 0)) break;
      const nextId = coverPending ? cover.photoId : nextInGridOrder(queueRef.current, uploadQueue.current);
      if (!nextId) break;
      uploadQueue.current = uploadQueue.current.filter((photoId) => photoId !== nextId);
      runningUploads.current += 1;
      uploadPhotoRef.current(nextId).finally(() => {
        runningUploads.current -= 1;
        uploadsInFlight.current.delete(nextId);
        processUploadQueue();
      });
    }
  }, []);

  const processCompressions = useCallback(() => {
    if (compressing.current) return;
    const nextId = nextInGridOrder(queueRef.current, compressionWaiting.current.keys());
    const job = nextId === undefined ? undefined : compressionWaiting.current.get(nextId);
    if (nextId === undefined || !job) return;
    compressionWaiting.current.delete(nextId);
    compressing.current = true;
    compressPhotoRef.current(nextId, job).finally(() => {
      compressing.current = false;
      job.settle();
      processCompressions();
    });
  }, []);

  // Queue photos for upload, leaving out any already waiting or uploading. A
  // photo stays `compressed` until its upload has read the staged file, so the
  // resume after init and one from the app or network can both pick it.
  const enqueueUploads = useCallback(
    (photoIds: string[]) => {
      for (const photoId of photoIds) {
        if (uploadsInFlight.current.has(photoId)) continue;
        uploadsInFlight.current.add(photoId);
        uploadQueue.current.push(photoId);
      }
      processUploadQueue();
    },
    [processUploadQueue],
  );

  // Initialize queue from draft + local files
  useEffect(() => {
    // The hook outlives each wizard session. Photos still in the queue belong to
    // the draft that was open before, and must not be merged into this one. The
    // emptied queue is no longer any draft's restored queue, so a draft reopened
    // before the key in between has settled is read from the device again. This
    // runs before both guards below for that reason.
    if (queueRef.current.stagingKey !== stagingKey) {
      for (const photoId of uploadQueue.current) uploadsInFlight.current.delete(photoId);
      uploadQueue.current = [];
      for (const job of compressionWaiting.current.values()) job.settle();
      compressionWaiting.current.clear();
      queueRef.current = { stagingKey, photos: [] };
      setQueue(queueRef.current);
      initializedStagingKey.current = null;
      setReadyKey(null);
    }
    if (initializedStagingKey.current === stagingKey) return;
    // One init per staging key. A second one, started when the payload changes
    // while the first is still reading the device, would rebuild the queue from
    // that later payload and replace the keyed photos the first one restored.
    if (initializingStagingKeys.current.has(stagingKey)) return;
    initializingStagingKeys.current.add(stagingKey);
    async function init() {
      let localPhotoIds: string[] = [];
      if (restoreLocalPhotos) {
        localPhotoIds = await listLocalPhotoIds(stagingKey);
      } else if (stagingKey) {
        // Best effort: a failed cleanup must not keep the session from seeding.
        await deleteDraftDir(stagingKey).catch(() => undefined);
      }
      if (activeStagingKey.current !== stagingKey) return;
      const reconstructed = reconstructQueueFromDraft(
        stagingKey,
        initialPayload,
        localPhotoIds,
      );

      // If the user added photos before disk scanning finished, merge them in
      // so async initialization doesn't silently drop in-flight selections.
      const existing = queueRef.current.photos;
      const reconstructedIds = new Set(
        reconstructed.photos.map((p) => p.photoId),
      );
      const merged = [
        ...reconstructed.photos,
        ...existing.filter((p) => !reconstructedIds.has(p.photoId)),
      ].map((p, index) => ({ ...p, sortOrder: index }));

      queueRef.current = { stagingKey, photos: merged };
      setQueue(queueRef.current);
      initializedStagingKey.current = stagingKey;
      setReadyKey(stagingKey);

      // Photos an earlier session staged but did not finish uploading resume
      // now; nothing else would start them until the app or network returns.
      const unfinished = collectPhotosToResume(reconstructed);
      enqueueUploads(unfinished.map((p) => p.photoId));
    }
    void init().finally(() => {
      initializingStagingKeys.current.delete(stagingKey);
    });
  }, [stagingKey, initialPayload, restoreLocalPhotos, enqueueUploads]);

  const transitionToFailed = useCallback((photoId: string, error: UploadError) => {
    queueRef.current = transitionPhotoToFailed(queueRef.current, photoId, error);
    setQueue(queueRef.current);
  }, []);

  const transitionToPresigned = useCallback((photoId: string) => {
    queueRef.current = updatePhotoState(queueRef.current, photoId, "presigned");
    setQueue(queueRef.current);
  }, []);

  const transitionToUploading = useCallback((photoId: string, uploadUrl: string) => {
    queueRef.current = updatePhotoState(queueRef.current, photoId, "uploading", { uploadUrl });
    setQueue(queueRef.current);
  }, []);

  const transitionToUploaded = useCallback((photoId: string, key: string) => {
    queueRef.current = updatePhotoState(queueRef.current, photoId, "uploaded", { key });
    setQueue(queueRef.current);
  }, []);

  const uploadPhoto = useCallback(
    async (photoId: string) => {
      const photo = findPhotoById(queueRef.current, photoId);
      if (!photo) return;

      if (!networkAvailable.current) {
        queueRef.current = updatePhotoState(
          queueRef.current,
          photoId,
          "waiting_for_network",
        );
        setQueue(queueRef.current);
        return;
      }

      if (!photo.localUri) {
        transitionToFailed(photoId, {
          code: "LOCAL_FILE_MISSING",
          message: t("uploadErrorLocalFileMissing"),
          retryable: false,
        });
        return;
      }

      let fileInfo = await FileSystem.getInfoAsync(photo.localUri);
      let fileSize = photo.fileSize;
      try {
        // 2.0.3 staged JPEGs use the same photo identity. Decode/encode them;
        // renaming or changing the MIME alone would upload mislabeled bytes.
        if (!fileInfo.exists && photo.localUri === getStagingPath(stagingKey, photoId)) {
          const legacyUri = photo.localUri.replace(/\.webp$/, ".jpg");
          if ((await FileSystem.getInfoAsync(legacyUri)).exists) {
            const converted = await compressPhoto(legacyUri, photo.localUri);
            fileInfo = await FileSystem.getInfoAsync(converted.uri);
            if (!fileInfo.exists || fileInfo.size <= 0 || fileInfo.size > 5 * 1024 * 1024 || converted.width <= 0 || converted.height <= 0 || Math.max(converted.width, converted.height) > 2400) throw new CompressionError("Invalid converted photo", "MANIPULATION_FAILED");
            fileSize = fileInfo.size;
            queueRef.current = updatePhotoState(queueRef.current, photoId, "compressed", { ...converted, localUri: converted.uri, fileSize });
            setQueue(queueRef.current);
            await FileSystem.deleteAsync(legacyUri, { idempotent: true }).catch(() => undefined);
          }
        }
      } catch (err) {
        transitionToFailed(photoId, buildUploadError(err, t));
        return;
      }
      if (!fileInfo.exists) {
        transitionToFailed(photoId, {
          code: "LOCAL_FILE_MISSING",
          message: t("uploadErrorLocalFileMissing"),
          retryable: false,
        });
        return;
      }

      const measurement=beginPhotoMeasurement("upload");
      try {
        transitionToPresigned(photoId);
        startUpload();

        const presignResult = await presignMutation.mutateAsync({
          ...(businessId ? { businessId } : {}),
          kind: "image",
          contentType: "image/webp",
          // A photo restored from staging has no recorded size; its file does.
          sizeBytes: fileSize ?? fileInfo.size,
          writeProtocol: "conditional-v1",
        });

        if (!networkAvailable.current) {
          queueRef.current = updatePhotoState(
            queueRef.current,
            photoId,
            "waiting_for_network",
            { uploadUrl: presignResult.uploadUrl },
          );
          setQueue(queueRef.current);
          return;
        }

        transitionToUploading(photoId, presignResult.uploadUrl);
        await uploadFileToPresignedUrl(presignResult.uploadUrl, photo.localUri, presignResult.headers);
        transitionToUploaded(photoId, presignResult.key);
        measurement("success");
      } catch (err) {
        measurement(err instanceof ApiError && err.status===403?"expected_rejection":"technical_failure",err instanceof ApiError && err.status===403?"permission":err instanceof ApiError && err.code==="NETWORK_ERROR"?"network":"unknown");
        const uploadError = buildUploadError(err, t);
        transitionToFailed(photoId, uploadError);
      } finally {
        endUpload();
      }
    },
    [stagingKey, businessId, presignMutation, transitionToFailed, transitionToPresigned, transitionToUploading, transitionToUploaded],
  );

  uploadPhotoRef.current = uploadPhoto;

  // Resume pending uploads on app active / network available
  useEffect(() => {
    const cleanup = setupUploadResume({
      resumePendingUploads: () => {
        const photosToRetry = collectPhotosToResume(queueRef.current);
        enqueueUploads(photosToRetry.map((p) => p.photoId));
      },
      onNetworkAvailable: () => {
        networkAvailable.current = true;
      },
      onNetworkUnavailable: () => {
        networkAvailable.current = false;
        // Photos that had not started are dropped from the wait; the running
        // ones leave `uploadsInFlight` when their upload settles.
        for (const photoId of uploadQueue.current) uploadsInFlight.current.delete(photoId);
        uploadQueue.current = [];
        queueRef.current = transitionUploadQueueToWaitingForNetwork(
          queueRef.current,
        );
        setQueue(queueRef.current);
      },
    });
    return cleanup;
  }, [enqueueUploads]);

  const compressPicked = useCallback(
    async (photoId: string, { sourceUri, stagingKey: jobKey }: CompressionJob) => {
      // Removed while it waited, or left behind by another draft.
      if (jobKey !== activeStagingKey.current || !findPhotoById(queueRef.current, photoId)) return;
      const measurement=beginPhotoMeasurement("preparation");
      try {
        await ensureDraftDir(jobKey);
        const destinationUri = getStagingPath(jobKey, photoId);
        const compressed = await compressPhoto(sourceUri, destinationUri);

        const destExists = await verifyStagingFileExists(destinationUri);
        if (!destExists) {
          throw new CompressionError(
            "Photo file missing — please remove and re-select",
            "DESTINATION_MISSING",
          );
        }

        queueRef.current = updatePhotoState(queueRef.current, photoId, "compressed", {
          localUri: compressed.uri,
          width: compressed.width,
          height: compressed.height,
          fileSize: compressed.fileSize,
        });
        setQueue(queueRef.current);

        measurement("success");
        enqueueUploads([photoId]);
      } catch (err) {
        measurement(err instanceof CompressionError && err.code==="SOURCE_MISSING"?"expected_rejection":"technical_failure",err instanceof CompressionError && err.code==="SOURCE_MISSING"?"validation":"unknown");
        const uploadError = buildUploadError(err, t);
        queueRef.current = transitionPhotoToFailed(queueRef.current, photoId, uploadError);
        setQueue(queueRef.current);
        processUploadQueue();
      }
    },
    [enqueueUploads, processUploadQueue, t],
  );

  compressPhotoRef.current = compressPicked;

  /** Adds a tile at the end of the grid at once; settles once the photo is compressed. */
  const addPhoto = useCallback(
    (sourceUri: string) => {
      const photoId = generateUUID();
      const nextSortOrder = queueRef.current.photos.length;

      queueRef.current = appendPhotoToQueue(
        queueRef.current,
        createStagedPhoto(photoId, nextSortOrder),
      );
      setQueue(queueRef.current);

      startCompression();
      return new Promise<void>((resolve) => {
        compressionWaiting.current.set(photoId, {
          sourceUri,
          stagingKey,
          settle: () => {
            endCompression();
            resolve();
          },
        });
        processCompressions();
      });
    },
    [stagingKey, processCompressions, startCompression, endCompression],
  );

  // Both write `queueRef` at once: the next compression and upload are picked
  // from it, possibly before React renders.
  const removePhoto = useCallback(
    (photoId: string) => {
      const photo = findPhotoById(queueRef.current, photoId);
      if (photo?.localUri) {
        void FileSystem.deleteAsync(photo.localUri, { idempotent: true });
      }
      queueRef.current = removePhotoFromQueue(queueRef.current, photoId);
      setQueue(queueRef.current);
      processUploadQueue();
    },
    [processUploadQueue],
  );

  const reorderPhotos = useCallback(
    (photoIds: string[]) => {
      queueRef.current = reorderPhotosInQueue(queueRef.current, photoIds);
      setQueue(queueRef.current);
      processUploadQueue();
    },
    [processUploadQueue],
  );

  const retryPhoto = useCallback(
    (photoId: string) => {
      enqueueUploads([photoId]);
    },
    [enqueueUploads],
  );

  const publishGate: PublishGateResult = computePublishGate(queue);
  const photos = queue.photos;

  return {
    photos,
    addPhoto,
    removePhoto,
    reorderPhotos,
    retryPhoto,
    publishGate,
    isCompressing,
    isUploading,
    /** True once this staging key's saved and staged photos are in `photos`. */
    isReady: readyKey === stagingKey,
  };
}
