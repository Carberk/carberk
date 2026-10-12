import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { ApiError } from "../../api/client";

const CHAT_STAGING_ROOT = `${FileSystem.documentDirectory}chat-staging/`;

export interface ChatImageAttachment {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface ChatImageUploadResult {
  key: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface PresignChatAttachmentResult {
  uploadUrl: string;
  key: string;
}

export class ChatImageUploadError extends Error {
  constructor(
    message: string,
    public readonly code: "compression_failed" | "presign_failed" | "put_failed" | "file_missing",
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ChatImageUploadError";
  }
}

function getChatStagingDir(conversationId: string): string {
  return `${CHAT_STAGING_ROOT}${conversationId}/`;
}

export function getChatImageStagingPath(
  conversationId: string,
  clientMessageId: string,
): string {
  return `${getChatStagingDir(conversationId)}${clientMessageId}.webp`;
}

export async function ensureChatStagingDir(conversationId: string): Promise<void> {
  const dir = getChatStagingDir(conversationId);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 0.8;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function compressChatImage(
  sourceUri: string,
  destinationUri: string,
): Promise<ChatImageAttachment> {
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new ChatImageUploadError(
      "Source image file is missing",
      "file_missing",
      false,
    );
  }

  try {
    const context = ImageManipulator.manipulate(sourceUri);
    const decoded = await context.renderAsync();
    const longSide = Math.min(MAX_DIMENSION, Math.max(decoded.width, decoded.height));
    context.resize(decoded.width >= decoded.height ? { width: longSide } : { height: longSide });
    decoded.release?.();
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: SaveFormat.WEBP,
      compress: WEBP_QUALITY,
    });

    let finalUri = result.uri;
    let fileInfo = await FileSystem.getInfoAsync(finalUri);
    let fileSize = fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0;

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const recompressContext = ImageManipulator.manipulate(finalUri);
      const recompressed = await recompressContext.renderAsync();
      const recompressResult = await recompressed.saveAsync({
        format: SaveFormat.WEBP,
        compress: 0.6,
      });
      finalUri = recompressResult.uri;
      fileInfo = await FileSystem.getInfoAsync(finalUri);
      fileSize = fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0;
    }

    if (finalUri !== destinationUri) {
      try {
        await FileSystem.copyAsync({ from: finalUri, to: destinationUri });
      } catch {
        throw new ChatImageUploadError(
          "Failed to transfer compressed image to staging",
          "compression_failed",
          true,
        );
      }
      try {
        await FileSystem.deleteAsync(finalUri, { idempotent: true });
      } catch {
        // Best-effort cleanup; don't fail compression if delete fails.
      }
    }

    const destInfo = await FileSystem.getInfoAsync(destinationUri);
    if (!destInfo.exists) {
      throw new ChatImageUploadError(
        "Compressed image file is missing after transfer",
        "compression_failed",
        true,
      );
    }

    return {
      uri: destinationUri,
      width: result.width,
      height: result.height,
      fileSize,
    };
  } catch (err) {
    if (err instanceof ChatImageUploadError) {
      throw err;
    }
    throw new ChatImageUploadError(
      err instanceof Error ? err.message : "Image compression failed",
      "compression_failed",
      true,
    );
  }
}

export async function uploadChatImageToPresignedUrl(
  uploadUrl: string,
  localUri: string,
): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new ChatImageUploadError(
      "Local image file is missing before upload",
      "file_missing",
      false,
    );
  }

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": "image/webp",
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new ChatImageUploadError(
      `Image upload failed with status ${uploadResult.status}`,
      "put_failed",
      true,
    );
  }
}

export function classifyChatUploadError(err: unknown): ChatImageUploadError {
  if (err instanceof ChatImageUploadError) {
    return err;
  }

  if (err instanceof ApiError) {
    if (err.code === "NETWORK_ERROR") {
      return new ChatImageUploadError(
        "Network error while uploading image",
        "put_failed",
        true,
      );
    }
    if (err.status === 429) {
      return new ChatImageUploadError(
        "Rate limited while uploading image",
        "put_failed",
        true,
      );
    }
    return new ChatImageUploadError(
      err.message || "Presign request failed",
      "presign_failed",
      true,
    );
  }

  const message = err instanceof Error ? err.message : "Image upload failed";
  if (
    message.toLowerCase().includes("network") ||
    err instanceof TypeError
  ) {
    return new ChatImageUploadError(message, "put_failed", true);
  }

  return new ChatImageUploadError(message, "put_failed", true);
}
