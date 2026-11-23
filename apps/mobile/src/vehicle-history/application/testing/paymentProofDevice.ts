import { vi } from "vitest";
import type { FileSystemUploadOptions, UploadProgressData } from "expo-file-system/legacy";

export const proofDevice = { files: new Map<string, { size: number; bytes: string }>(), failUpload: false };
export const proofFileSystem = {
  documentDirectory: "file:///documents/",
  FileSystemUploadType: { BINARY_CONTENT: 0 }, FileSystemSessionType: { FOREGROUND: 0 },
  getInfoAsync: vi.fn(async (uri: string) => ({ exists: proofDevice.files.has(uri), size: proofDevice.files.get(uri)?.size ?? 0, isDirectory: false })),
  makeDirectoryAsync: vi.fn(async () => undefined),
  copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    const file = proofDevice.files.get(from); if (!file) throw new Error("Unreadable file"); proofDevice.files.set(to, file);
  }),
  deleteAsync: vi.fn(async (uri: string) => { proofDevice.files.delete(uri); }),
  createUploadTask: vi.fn((url: string, uri: string, options: FileSystemUploadOptions, progress?: (data: UploadProgressData) => void) => ({
    cancelAsync: vi.fn(async () => undefined),
    uploadAsync: async () => {
      const file = proofDevice.files.get(uri); if (!file) throw new Error("Missing file");
      progress?.({ totalBytesSent: 50, totalBytesExpectedToSend: 100 });
      if (proofDevice.failUpload) throw new Error("Interrupted upload");
      const response = await fetch(url, { method: options.httpMethod, headers: options.headers, body: file.bytes });
      progress?.({ totalBytesSent: 100, totalBytesExpectedToSend: 100 });
      return { status: response.status, body: await response.text(), headers: {}, mimeType: "application/json" };
    },
  })),
};
