import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

import { stripImageMetadata } from "../../../common/stripImageMetadata";
import { computeThumbHash } from "../../../common/thumbHash";
import type { Env } from "../../../env.schema";
import { CHAT_ATTACHMENT_MAX_SIZE_BYTES } from "../domain/ChatAttachment";
import type {
  ChatAttachmentCleaner,
  ChatAttachmentCleanResult,
} from "../domain/ports/ChatAttachmentCleaner";

const BUCKET = "chat-attachments";
/** The app bounds only the width it sends (2400 px); this bounds the decode on the request path. */
const MAX_PIXELS = 50_000_000;

/**
 * A missing key is NotFound on HEAD and NoSuchKey on GET. Any other 404
 * (a missing bucket reports NoSuchBucket) is a server fault, not an absent
 * object, and must surface instead of answering "missing".
 */
function isNotFound(err: unknown): boolean {
  const failure = err as { name?: string };
  return failure.name === "NotFound" || failure.name === "NoSuchKey";
}

@Injectable()
export class SharpChatAttachmentCleaner implements ChatAttachmentCleaner {
  private readonly s3: S3Client;
  private readonly logger = new Logger(SharpChatAttachmentCleaner.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {
    this.s3 = new S3Client({
      endpoint: this.config.get("MINIO_ENDPOINT", { infer: true }),
      region: this.config.get("MINIO_REGION", { infer: true }),
      credentials: {
        accessKeyId: this.config.get("MINIO_ACCESS_KEY", { infer: true }),
        secretAccessKey: this.config.get("MINIO_SECRET_KEY", { infer: true }),
      },
      forcePathStyle: true,
    });
  }

  async clean(key: string): Promise<ChatAttachmentCleanResult> {
    const input = await this.read(key);
    if (input === null) return { status: "missing" };
    if (input === "too-large") return { status: "invalid" };

    const format = key.endsWith(".webp") ? "webp" : "jpeg";
    let cleaned: Buffer | null;
    let thumbHash: string;
    try {
      // The key's extension is the sender's claim; the bytes must agree.
      const stored = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
      if (stored.format !== format) return { status: "invalid" };
      cleaned = await stripImageMetadata(
        input,
        format,
        CHAT_ATTACHMENT_MAX_SIZE_BYTES,
        MAX_PIXELS,
      );
      // The blurred preview comes from the same cleaned, upright image.
      thumbHash = await computeThumbHash(cleaned ?? input, MAX_PIXELS);
    } catch (err) {
      this.logger.warn(
        `Chat attachment ${key} is not a usable image: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: "invalid" };
    }

    // The image stays readable at this key, so it is replaced in place.
    if (cleaned) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: cleaned,
          ContentType: `image/${format}`,
        }),
      );
    }
    return { status: "clean", thumbHash };
  }

  /**
   * The HEAD keeps an over-cap object from being fetched when the store
   * reports ContentLength. When only the download reports it, the body is
   * dropped unread; the length guard after the read covers a store that
   * understates both.
   */
  private async read(key: string): Promise<Buffer | "too-large" | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
      );
      if ((head.ContentLength ?? 0) > CHAT_ATTACHMENT_MAX_SIZE_BYTES) return "too-large";
      const object = await this.s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      );
      if (!object.Body) return null;
      if ((object.ContentLength ?? 0) > CHAT_ATTACHMENT_MAX_SIZE_BYTES) {
        (object.Body as { destroy?: () => void }).destroy?.();
        return "too-large";
      }
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      return bytes.length > CHAT_ATTACHMENT_MAX_SIZE_BYTES ? "too-large" : bytes;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}
