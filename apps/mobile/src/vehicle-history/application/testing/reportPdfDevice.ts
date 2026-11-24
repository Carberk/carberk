import { vi } from "vitest";

export const reportPdfFiles = new Map<string, string>();
export const destination = "content://synthetic.documents/report.pdf";
export const reportPdfFileSystem = {
  cacheDirectory: "file:///sandbox/",
  EncodingType: { Base64: "base64" },
  makeDirectoryAsync: vi.fn(async () => undefined),
  writeAsStringAsync: vi.fn(async (path: string, bytes: string) => { reportPdfFiles.set(path, bytes); }),
  readAsStringAsync: vi.fn(async (path: string) => reportPdfFiles.get(path)),
  deleteAsync: vi.fn(async (path: string) => {
    for (const item of reportPdfFiles.keys()) if (item === path || item.startsWith(path)) reportPdfFiles.delete(item);
  }),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: vi.fn(async () => ({ granted: true, directoryUri: "content://synthetic.documents/reports" })),
    createFileAsync: vi.fn(async () => { reportPdfFiles.set(destination, ""); return destination; }),
  },
};
