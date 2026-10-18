import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { File } from "expo-file-system";
import { z } from "zod";

import type { PreparedVideo } from "../videoPreparation/VideoPreparation";

import type { VideoTransferDevice, VideoTransferRecord } from "./VideoTransfer";

const maxBytes = 15 * 1024 * 1024;
const preparedSchema = z.object({
  uri: z.string().max(2048).refine(uri => {
    try {
      const url = new URL(uri), decoded = decodeURIComponent(url.pathname);
      return url.protocol === "file:" && !url.host && !url.search && !url.hash && !decoded.includes("\\") && !decoded.split("/").some(part => part === "." || part === "..") && /\/listing-video-preparation\/[A-Za-z0-9-]{1,80}\/prepared\.mp4$/.test(decoded);
    } catch { return false; }
  }),
  durationMs: z.number().positive().max(90_000), sizeBytes: z.number().int().positive().max(maxBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().positive().max(1280), height: z.number().int().positive().max(1280), fps: z.number().positive().max(30),
  videoCodec: z.literal("h264"), audioCodec: z.literal("aac").nullable(), colour: z.literal("bt709"),
}).strict().refine(value => value.width >= value.height ? value.height <= 720 : value.width <= 720);
const recordSchema = z.object({
  version: z.literal(1), ownerId: z.string().uuid(), idempotencyKey: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  target: z.object({ kind: z.enum(["draft", "listing"]), id: z.string().uuid() }).strict(), prepared: preparedSchema,
  posterMs: z.number().int().min(0), businessId: z.string().uuid().optional(), sessionId: z.string().uuid().optional(),
  state: z.enum(["UPLOADING", "PAUSED", "PROCESSING", "CANCELLED", "FAILED"]), confirmedBytes: z.number().int().min(0).max(maxBytes),
}).strict().refine(value => value.posterMs < value.prepared.durationMs && value.confirmedBytes <= value.prepared.sizeBytes);

/** Bounded app-private prepared files. Persist only strict metadata, and hash
 * staged bytes again on recovery before the first signed part request. */
export class ExpoVideoTransferDevice implements VideoTransferDevice {
  private readonly key: string;
  constructor(private readonly ownerId: string, private readonly targetId: string, private readonly targetKind: "listing" | "draft" = "listing") {
    if (!z.string().uuid().safeParse(ownerId).success || !z.string().uuid().safeParse(targetId).success) throw new Error("VIDEO_JOURNAL_INVALID");
    this.key = `listing-video-transfer:v1:${ownerId}:${targetKind}:${targetId}`;
  }
  async load(): Promise<VideoTransferRecord | null> {
    const value = await AsyncStorage.getItem(this.key);
    if (value === null) return null;
    if (value.length > 8192) throw new Error("VIDEO_JOURNAL_INVALID");
    try { return this.validRecord(JSON.parse(value)); }
    catch { throw new Error("VIDEO_JOURNAL_INVALID"); }
  }
  async save(record: VideoTransferRecord): Promise<void> {
    const value = this.validRecord(record);
    await AsyncStorage.setItem(this.key, JSON.stringify(value));
  }
  async verify(prepared: PreparedVideo): Promise<boolean> {
    if (!preparedSchema.safeParse(prepared).success) return false;
    try {
      const file = new File(prepared.uri);
      if (!file.exists || file.size !== prepared.sizeBytes) return false;
      const bytes = await file.bytes();
      if (bytes.byteLength !== prepared.sizeBytes || bytes.byteLength > maxBytes) return false;
      const hash = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes));
      return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("") === prepared.sha256;
    } catch { return false; }
  }
  async readPart(prepared: PreparedVideo, offset: number, size: number): Promise<Uint8Array> {
    if (!preparedSchema.safeParse(prepared).success || !Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 1 || size > 5 * 1024 * 1024 || offset + size > prepared.sizeBytes) throw new Error("VIDEO_LOCAL_SOURCE_UNAVAILABLE");
    const file = new File(prepared.uri);
    if (!file.exists || file.size !== prepared.sizeBytes) throw new Error("VIDEO_LOCAL_SOURCE_UNAVAILABLE");
    const handle = file.open();
    try { handle.offset = offset; const bytes = handle.readBytes(size); if (bytes.byteLength !== size) throw new Error("VIDEO_LOCAL_SOURCE_UNAVAILABLE"); return bytes; }
    finally { handle.close(); }
  }
  private validRecord(record: unknown): VideoTransferRecord {
    const parsed = recordSchema.safeParse(record);
    if (!parsed.success || parsed.data.ownerId !== this.ownerId || parsed.data.target.id !== this.targetId || parsed.data.target.kind !== this.targetKind) throw new Error("VIDEO_JOURNAL_INVALID");
    return parsed.data;
  }
}
