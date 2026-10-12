import type { ImagePickerAsset, ImagePickerResult } from "expo-image-picker";
import type { UploadProgressData, FileSystemUploadOptions } from "expo-file-system/legacy";
import { vi } from "vitest";

/** Native boundaries shared by Profile's rendered flow and its upload hook tests. */
export const photoDevice = {
  result: { canceled: true, assets: null } as ImagePickerResult,
  cameraGranted: false,
  size: 2048,
  readable: true,
  dimensions: { width: 1024, height: 1024 },
  renderWait: null as Promise<void> | null,
  renderStarted: vi.fn(),
  sent: [] as { url: string; uri: string; options?: FileSystemUploadOptions }[],
  progress: (_data: UploadProgressData) => {},
  finish: (_status = 200) => {},
  fail: (_error: Error) => {},
  library: vi.fn(async (_options?: unknown) => photoDevice.result),
  camera: vi.fn(async (_options?: unknown) => photoDevice.result),
  permission: vi.fn(async () => ({ granted: photoDevice.cameraGranted, canAskAgain: false, status: photoDevice.cameraGranted ? "granted" : "denied" })),
  libraryPermission: vi.fn(),
  cancelUpload: vi.fn(async () => {}),
  saves: [] as unknown[],
  savedImages: [] as { uri: string; width: number; height: number }[],
  crops: [] as { originX: number; originY: number; width: number; height: number }[],
  deletes: [] as string[],
};

export function resetPhotoDevice() {
  photoDevice.result = { canceled: true, assets: null };
  photoDevice.cameraGranted = false;
  photoDevice.size = 2048;
  photoDevice.readable = true;
  photoDevice.dimensions = { width: 1024, height: 1024 };
  photoDevice.renderWait = null;
  photoDevice.sent = [];
  photoDevice.saves = [];
  photoDevice.savedImages = [];
  photoDevice.crops = [];
  photoDevice.deletes = [];
  photoDevice.progress = () => {};
  photoDevice.finish = () => {};
  photoDevice.fail = () => {};
  vi.clearAllMocks();
}

export function choosePhoto(overrides: Partial<ImagePickerAsset> = {}) {
  photoDevice.result = {
    canceled: false,
    assets: [{ uri: "file:///selected.png", width: 1024, height: 1024, mimeType: "image/png", type: "image", ...overrides }],
  };
}

export const fileSystemFake = {
  cacheDirectory: "file:///cache/",
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  getInfoAsync: async () => ({ exists: true, isDirectory: false, size: photoDevice.size }),
  copyAsync: async () => {},
  deleteAsync: async (uri: string) => { photoDevice.deletes.push(uri); },
  createUploadTask: (url: string, uri: string, options?: FileSystemUploadOptions, progress?: (data: UploadProgressData) => void) => {
    photoDevice.sent.push({ url, uri, options });
    photoDevice.progress = progress ?? (() => {});
    return { cancelAsync: photoDevice.cancelUpload, uploadAsync: () => new Promise((resolve, reject) => {
      photoDevice.finish = (status = 200) => resolve({ status, body: "", headers: {} });
      photoDevice.fail = reject;
    }) };
  },
};

export const imageManipulatorFake = {
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
  ImageManipulator: { manipulate: (source: string) => {
    const saved = photoDevice.savedImages.find((image) => image.uri === source);
    let dimensions = saved ? { width: saved.width, height: saved.height } : { ...photoDevice.dimensions };
    return {
      resize: (size: { width?: number; height?: number }) => {
        const factor = size.width ? size.width / dimensions.width : (size.height ?? dimensions.height) / dimensions.height;
        dimensions = { width: size.width ?? Math.round(dimensions.width * factor), height: size.height ?? Math.round(dimensions.height * factor) };
      },
      crop: (rect: { originX: number; originY: number; width: number; height: number }) => {
        if (rect.originX < 0 || rect.originY < 0 || rect.originX + rect.width > dimensions.width || rect.originY + rect.height > dimensions.height) throw new Error("Crop outside image");
        photoDevice.crops.push(rect);
        dimensions = { width: rect.width, height: rect.height };
      },
      release: () => {},
      renderAsync: async () => {
        photoDevice.renderStarted();
        await photoDevice.renderWait;
        if (!photoDevice.readable) throw new Error("Not a picture");
        return { ...dimensions, release: () => {}, saveAsync: async (options: unknown) => {
          photoDevice.saves.push(options);
          const saved = { uri: `file:///compressed-${photoDevice.saves.length}.webp`, ...dimensions };
          photoDevice.savedImages.push(saved);
          return saved;
        } };
      },
    };
  } },
};
