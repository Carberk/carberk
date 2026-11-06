import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import {
  ListingVideoError,
  MAX_OUTPUT_BYTES,
  prepareListingVideo,
  type ListingVideoNativeModule,
  type PrepareHandle,
  type PreparedVideoFile,
} from "../../../modules/listing-video/src/prepare";
import { loadListingVideoNative } from "../../../modules/listing-video/src/index";

import type { ListingVideoSelection } from "./listingVideo";

/**
 * Phone-side preparation for one chosen Listing video (#1044).
 *
 * The picker source is copied into app storage first, so a later picker or
 * permission change cannot lose it. Only the copy is handed to the native
 * module (#1039); the library original is never prepared in place and never
 * uploaded. Only a complete, checked output (duration near the kept
 * interval, a real video track, at most 15 MiB) is kept for upload (#1045).
 * Leaving the app while preparing stops the job; the trim and cover are
 * kept so the seller can prepare again.
 */

export type ListingVideoPrepFailure = "source" | "interrupted" | "storage" | "preparation";

export type ListingVideoPrepState =
  | { phase: "idle" }
  | { phase: "preparing"; selection: ListingVideoSelection }
  | { phase: "prepared"; selection: ListingVideoSelection; file: PreparedVideoFile }
  | { phase: "failed"; selection: ListingVideoSelection; failure: ListingVideoPrepFailure };

/** File-system seam (system boundary) so tests can use the mocked legacy FS. */
export interface ListingVideoFileSystem {
  documentDirectory: string | null;
  copy(from: string, to: string): Promise<void>;
  ensureDir(dir: string): Promise<void>;
  remove(uri: string): Promise<void>;
  exists(uri: string): Promise<boolean>;
}

export const expoListingVideoFileSystem: ListingVideoFileSystem = {
  documentDirectory: FileSystem.documentDirectory,
  copy: async (from, to) => {
    await FileSystem.copyAsync({ from, to });
  },
  ensureDir: async (dir) => {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  },
  remove: async (uri) => {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },
  exists: async (uri) => (await FileSystem.getInfoAsync(uri)).exists,
};

export type AppStateSubscribe = (onBackground: () => void) => () => void;

const defaultSubscribeAppState: AppStateSubscribe = (onBackground) => {
  const add = (AppState as { addEventListener?: unknown } | undefined)?.addEventListener;
  if (typeof add !== "function") return () => undefined;
  const sub = (
    AppState as unknown as {
      addEventListener: (
        event: "change",
        listener: (status: string) => void,
      ) => { remove: () => void };
    }
  ).addEventListener("change", (status) => {
    if (status === "background" || status === "inactive") onBackground();
  });
  return () => sub.remove();
};

export function failureForError(error: unknown): ListingVideoPrepFailure {
  const code = error instanceof ListingVideoError ? error.code : "";
  if (code === "source-unreadable" || code === "invalid-source") return "source";
  if (code === "insufficient-storage") return "storage";
  return "preparation";
}

/** A prepared file is usable only when it is complete and inside the cap. */
export function validatePreparedOutput(
  file: PreparedVideoFile,
  selection: ListingVideoSelection,
): void {
  const intervalS = selection.endS - selection.startS;
  if (!file.uri || file.sizeBytes <= 0 || file.sizeBytes > MAX_OUTPUT_BYTES) {
    throw new ListingVideoError("export-failed", "The prepared video is missing or too large.");
  }
  if (!Number.isFinite(file.durationS) || Math.abs(file.durationS - intervalS) > 1.5) {
    throw new ListingVideoError("export-failed", "The prepared video has the wrong duration.");
  }
  if (!(file.width > 0) || !(file.height > 0)) {
    throw new ListingVideoError("export-failed", "The prepared video has no video track.");
  }
}

function sourceExtension(uri: string): string {
  const clean = uri.split("?")[0] ?? uri;
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "mp4";
}

export interface UseListingVideoPreparationOptions {
  native?: ListingVideoNativeModule | null;
  fileSystem?: ListingVideoFileSystem;
  subscribeAppState?: AppStateSubscribe;
}

export function useListingVideoPreparation(options: UseListingVideoPreparationOptions = {}) {
  const nativeRef = useRef<ListingVideoNativeModule | null | undefined>(options.native);
  if (nativeRef.current === undefined && options.native !== undefined) nativeRef.current = options.native;
  const fs = options.fileSystem ?? expoListingVideoFileSystem;
  const subscribe = options.subscribeAppState ?? defaultSubscribeAppState;
  const [state, setState] = useState<ListingVideoPrepState>({ phase: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const handleRef = useRef<PrepareHandle | null>(null);
  const jobRef = useRef<{ dir: string; copiedUri: string; fileUri: string | null } | null>(null);
  const runRef = useRef(0);
  const prepareTokenRef = useRef(0);

  const getNative = useCallback((): ListingVideoNativeModule | null => {
    if (options.native !== undefined) return options.native;
    return loadListingVideoNative();
  }, [options.native]);

  type Job = { dir: string; copiedUri: string; fileUri: string | null };

  /** Detach the current job synchronously so a newer job is never cleared by an older cleanup. */
  const detachJob = useCallback((): Job | null => {
    const job = jobRef.current;
    jobRef.current = null;
    return job;
  }, []);

  const deleteJob = useCallback(
    async (job: Job | null) => {
      if (!job) return;
      if (job.fileUri) await fs.remove(job.fileUri).catch(() => undefined);
      await fs.remove(job.dir).catch(() => undefined);
    },
    [fs],
  );

  const run = useCallback(
    async (selection: ListingVideoSelection) => {
      const runId = ++runRef.current;
      setState({ phase: "preparing", selection });
      try {
        const native = getNative();
        // 1. Copy the source into app storage first (reuse the copy on retry).
        let job = jobRef.current;
        if (!job || !(await fs.exists(job.copiedUri).catch(() => false))) {
          const jobId = `prep-${runId}`;
          const dir = `${fs.documentDirectory ?? ""}listing-video/${jobId}/`;
          const copiedUri = `${dir}source.${sourceExtension(selection.source.uri)}`;
          try {
            await fs.ensureDir(dir);
            await fs.copy(selection.source.uri, copiedUri);
          } catch (copyError) {
            // Never leave a partial copy behind in an unpublished directory.
            await fs.remove(dir).catch(() => undefined);
            const code =
              typeof copyError === "object" && copyError !== null && "code" in copyError
                ? String((copyError as { code: unknown }).code)
                : "";
            const message = copyError instanceof Error ? copyError.message : "";
            if (/enospc|space|storage/i.test(code) || /no space|not enough space|out of space/i.test(message)) {
              throw new ListingVideoError("insufficient-storage", "There is not enough space to copy the video.");
            }
            throw new ListingVideoError("source-unreadable", "The source video could not be copied.");
          }
          job = { dir, copiedUri, fileUri: null };
          // Publish the job only while this run is current; a Cancel or
          // Remove during the copy must not leave the new copy orphaned.
          if (runRef.current !== runId) {
            await deleteJob(job);
            return;
          }
          jobRef.current = job;
        }
        if (runRef.current !== runId) return;
        // 2. Prepare only the copied file; the original is never used again.
        const handle = prepareListingVideo(
          native,
          job.copiedUri,
          selection.startS,
          selection.endS,
          selection.posterS,
        );
        handleRef.current = handle;
        const file = await handle.done;
        if (runRef.current !== runId) {
          // A superseded preparation must not orphan its output file.
          await fs.remove(file.uri).catch(() => undefined);
          return;
        }
        // 3. Keep only a complete, checked output for upload.
        job.fileUri = file.uri;
        validatePreparedOutput(file, selection);
        setState({ phase: "prepared", selection, file });
      } catch (error) {
        if (runRef.current !== runId) return;
        if (error instanceof ListingVideoError && error.code === "cancelled") {
          // Background interruption keeps the copy, trim and cover.
          if (stateRef.current.phase === "preparing") {
            setState({ phase: "failed", selection, failure: "interrupted" });
          }
          return;
        }
        const failure = failureForError(error);
        // A bad output file must not survive to upload.
        const job = jobRef.current;
        if (job?.fileUri) await fs.remove(job.fileUri).catch(() => undefined);
        if (job) job.fileUri = null;
        setState({ phase: "failed", selection, failure });
      } finally {
        if (runRef.current === runId) handleRef.current = null;
      }
    },
    [fs, getNative, deleteJob],
  );

  const prepare = useCallback(
    (selection: ListingVideoSelection) => {
      // Replacing a selection deletes the previous copy and output first;
      // only the latest selection may start once that deletion finishes.
      handleRef.current?.cancel();
      handleRef.current = null;
      const token = ++prepareTokenRef.current;
      void deleteJob(detachJob()).then(() => {
        if (token !== prepareTokenRef.current) return;
        void run(selection);
      });
    },
    [run, detachJob, deleteJob],
  );

  const prepareAgain = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== "failed") return;
    void run(current.selection);
  }, [run]);

  /** User Cancel: stop the job and delete every local file. */
  const cancel = useCallback(() => {
    prepareTokenRef.current += 1;
    runRef.current += 1;
    handleRef.current?.cancel();
    handleRef.current = null;
    void deleteJob(detachJob());
    setState({ phase: "idle" });
  }, [detachJob, deleteJob]);

  /** Remove: delete the copied source and any prepared output. */
  const remove = useCallback(() => {
    prepareTokenRef.current += 1;
    runRef.current += 1;
    handleRef.current?.cancel();
    handleRef.current = null;
    void deleteJob(detachJob());
    setState({ phase: "idle" });
  }, [detachJob, deleteJob]);

  // Leaving the app during preparation stops it (trim and cover are kept).
  useEffect(() => {
    return subscribe(() => {
      if (stateRef.current.phase !== "preparing") return;
      runRef.current += 1;
      handleRef.current?.cancel();
      handleRef.current = null;
      const current = stateRef.current;
      if (current.phase === "preparing") {
        setState({ phase: "failed", selection: current.selection, failure: "interrupted" });
      }
    });
  }, [subscribe]);

  return { state, prepare, prepareAgain, cancel, remove };
}
