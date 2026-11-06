import { requireNativeModule } from "expo-modules-core";

import {
  prepareListingVideo,
  type ListingVideoNativeModule,
  type NativePreparedFile,
  type PrepareHandle,
  type PrepareProgress,
} from "./prepare";

export * from "./prepare";

interface RawNativeModule {
  prepare(
    sourceUri: string,
    startS: number,
    endS: number,
    coverS: number,
    jobId: string,
  ): Promise<NativePreparedFile>;
  cancel(jobId: string): void;
  addListener(
    event: string,
    listener: (event: { jobId: string; fraction: number }) => void,
  ): { remove: () => void };
}

function loadNative(): ListingVideoNativeModule | null {
  try {
    const raw = requireNativeModule<RawNativeModule>("ListingVideo");
    return {
      prepare: (sourceUri, startS, endS, coverS, jobId) =>
        raw.prepare(sourceUri, startS, endS, coverS, jobId),
      cancel: (jobId) => raw.cancel(jobId),
      addProgressListener: (listener) => raw.addListener("onProgress", listener),
    };
  } catch {
    return null;
  }
}

/**
 * `prepare(source, startS, endS, coverS) -> progress events -> file`
 * or a typed `ListingVideoError`. See prepare.ts for the contract.
 */
export function prepare(
  source: string,
  startS: number,
  endS: number,
  coverS: number,
  onProgress?: (progress: PrepareProgress) => void,
): PrepareHandle {
  return prepareListingVideo(loadNative(), source, startS, endS, coverS, onProgress);
}
