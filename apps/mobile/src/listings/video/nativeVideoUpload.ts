import { ApiError } from "../../api/client";

export interface VideoUploadPart {
  uri: string;
  offset: number;
  sizeBytes: number;
  /** Owned preparation directory; terminal cleanup also removes parts left by a process kill. */
  temporaryDirectory?: string;
}

export interface VideoUploadTransport {
  put(url: string, part: VideoUploadPart, signal: AbortSignal): Promise<void>;
}

const UPLOAD_TIMEOUT_MS = 60_000;

/** RN cannot construct a Blob from typed arrays. Upload a bounded native file instead. */
export const nativeVideoUploadTransport: VideoUploadTransport = {
  async put(url, part, signal) {
    const fs = await import("expo-file-system/legacy");
    const temporaryUri = `${part.temporaryDirectory ?? fs.cacheDirectory}listing-video-part-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    let task: ReturnType<typeof fs.createUploadTask> | undefined;
    let cancellation: Promise<void> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let rejectInterrupted!: (error: Error) => void;
    const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
    const interrupt = (error: Error) => {
      cancellation = task?.cancelAsync().catch(() => undefined);
      rejectInterrupted(error);
    };
    const abort = () => interrupt(new ApiError("NETWORK_ERROR", 0, "Upload interrupted"));
    void interrupted.catch(() => undefined);
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) throw new ApiError("NETWORK_ERROR", 0, "Upload interrupted");
      const bytes = await fs.readAsStringAsync(part.uri, {
        encoding: fs.EncodingType.Base64, position: part.offset, length: part.sizeBytes,
      });
      if (signal.aborted) throw new ApiError("NETWORK_ERROR", 0, "Upload interrupted");
      await fs.writeAsStringAsync(temporaryUri, bytes, { encoding: fs.EncodingType.Base64 });
      if (signal.aborted) throw new ApiError("NETWORK_ERROR", 0, "Upload interrupted");
      task = fs.createUploadTask(url, temporaryUri, {
        httpMethod: "PUT", uploadType: fs.FileSystemUploadType.BINARY_CONTENT,
        sessionType: fs.FileSystemSessionType.FOREGROUND,
        headers: { "Content-Type": "video/mp4" },
      });
      timeout = setTimeout(() => interrupt(new ApiError("VIDEO_UPLOAD_TIMEOUT", 408, "Upload timed out")), UPLOAD_TIMEOUT_MS);
      const response = await Promise.race([task.uploadAsync(), interrupted]);
      if (!response || response.status < 200 || response.status >= 300) {
        throw new ApiError("VIDEO_PART_UPLOAD_FAILED", response?.status ?? 0, "Video part upload failed");
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      // The upload task has been cancelled before removing its private part file.
      await cancellation;
      await fs.deleteAsync(temporaryUri, { idempotent: true });
    }
  },
};
