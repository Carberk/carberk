import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type * as S3Sdk from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "./backfill-thumbhashes";

// The disposable store and database the operator script sees: storage keyed
// `bucket/key`, rows per table. Only the boundary is fake; the script's own
// selection, gate, hashing and conditional updates run as written.
type MediaRow = { id: string; kind: string; key: string; posterKey: string | null; thumbHash: string | null };
type MessageRow = { id: string; kind: string; metadata: Record<string, unknown> | null; deletedAt: Date | null };
const state = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  media: [] as MediaRow[],
  messages: [] as MessageRow[],
  users: [] as { avatarKey: string | null; avatarUrl: string | null }[],
  writes: 0,
}));

vi.mock("@aws-sdk/client-s3", async (original) => ({ ...await original<typeof S3Sdk>(), S3Client: class {
  destroy() {}
  async send(command: unknown) {
    if (command instanceof ListObjectsV2Command) {
      const prefix = `${command.input.Bucket}/`;
      return { Contents: [...state.objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ Key: key.slice(prefix.length), ETag: '"e"' })) };
    }
    if (command instanceof GetObjectCommand) {
      const body = state.objects.get(`${command.input.Bucket}/${command.input.Key}`);
      if (!body) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
      return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
    }
    throw new Error("Unexpected storage command");
  }
} }));

vi.mock("pg", () => ({ Pool: class {
  async end() {}
  async query(sql: string, values: unknown[] = []) {
    const text = sql.replace(/\s+/g, " ").trim();
    if (text.startsWith("SELECT") && text.includes('FROM "listing_media"')) return { rows: state.media.map((row) => ({ ...row })) };
    if (text.startsWith("SELECT") && text.includes('FROM "messages"')) return { rows: state.messages.filter((row) => row.metadata !== null).map((row) => ({ ...row, metadata: structuredClone(row.metadata) })) };
    if (text.startsWith("SELECT") && text.includes('FROM "users"')) return { rows: state.users };
    if (text.startsWith('UPDATE "listing_media"')) {
      const [hash, id, key] = values as string[];
      const row = state.media.find((candidate) => candidate.id === id && candidate.key === key && candidate.thumbHash === null);
      if (row) { row.thumbHash = String(hash); state.writes += 1; }
      return { rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('UPDATE "messages"')) {
      const [hash, id, key] = values as string[];
      const row = state.messages.find((candidate) => candidate.id === id && candidate.metadata?.["key"] === key && !("thumbHash" in (candidate.metadata ?? {})));
      if (row?.metadata) { row.metadata = { ...row.metadata, thumbHash: hash }; state.writes += 1; }
      return { rowCount: row ? 1 : 0 };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
} }));

const BLUE_HASH = "2yMBBYCIh4iHiHeAiId4dXh3f4f4";
const EXISTING = "1fsDBYCIiIiHiIdweIeHh4d4cIgH";
const CHAT_KEY = "chat-attachments/7d0c1a52-3b64-4e8f-9a17-5c2e8f1b6d90/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp";

const bluePhoto = () => sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 120, b: 200 } } }).webp({ lossless: true }).toBuffer();

async function seedConvertedEnvironment() {
  const photo = await bluePhoto();
  state.objects.set("listing-photos/pending/a/original.webp", photo);
  state.objects.set("listing-photos/pending/b/original.webp", photo);
  state.objects.set(`chat-attachments/${CHAT_KEY}`, photo);
  state.media = [
    { id: "m1", kind: "image", key: "pending/a/original.webp", posterKey: null, thumbHash: null },
    { id: "m2", kind: "image", key: "pending/b/original.webp", posterKey: null, thumbHash: EXISTING },
    { id: "m3", kind: "video", key: "pending/v/video.mp4", posterKey: "pending/b/original.webp", thumbHash: null },
  ];
  state.messages = [
    { id: "g1", kind: "image", metadata: { key: CHAT_KEY, width: 300, height: 200 }, deletedAt: null },
    { id: "g2", kind: "image", metadata: { key: CHAT_KEY, thumbHash: EXISTING }, deletedAt: null },
    { id: "g3", kind: "post_ref", metadata: { listingId: "l1", coverMediaKey: "pending/a/original.webp" }, deletedAt: null },
    { id: "g4", kind: "image", metadata: { key: CHAT_KEY }, deletedAt: new Date("2026-10-01T00:00:00Z") },
  ];
  state.users = [{ avatarKey: "profile/u1/original.webp", avatarUrl: null }];
}

const snapshot = () => structuredClone({ media: state.media, messages: state.messages });

beforeEach(() => {
  state.objects.clear(); state.media = []; state.messages = []; state.users = []; state.writes = 0;
  Object.assign(process.env, { DATABASE_URL: "postgresql://op@db.test:5432/autotm", MINIO_ENDPOINT: "http://minio.test", MINIO_ACCESS_KEY: "k", MINIO_SECRET_KEY: "s" });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("ThumbHash backfill operator script", () => {
  it("fills only the missing hashes of Listing photos and image Messages from the stored WebP originals", async () => {
    await seedConvertedEnvironment();

    await main(["apply"]);

    expect(state.media.map((row) => [row.id, row.thumbHash])).toEqual([["m1", BLUE_HASH], ["m2", EXISTING], ["m3", null]]);
    expect(state.messages.map((row) => [row.id, row.metadata?.["thumbHash"]])).toEqual([
      ["g1", BLUE_HASH], ["g2", EXISTING], ["g3", undefined], ["g4", undefined],
    ]);
    expect(state.messages[0]?.metadata).toEqual({ key: CHAT_KEY, width: 300, height: 200, thumbHash: BLUE_HASH });
  });

  it("changes nothing when applied again, and verify then passes", async () => {
    await seedConvertedEnvironment();
    await main(["apply"]);
    const after = snapshot();
    state.writes = 0;

    await main(["apply"]);
    await expect(main(["verify"])).resolves.toBeUndefined();

    expect(state.writes).toBe(0);
    expect(snapshot()).toEqual(after);
  });

  it("reports what it would fill on a dry run and writes nothing", async () => {
    await seedConvertedEnvironment();
    const before = snapshot();

    await main(["dry-run"]);

    expect(snapshot()).toEqual(before);
    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain("1 Listing photos and 1 image Messages need a ThumbHash");
  });

  it.each([
    ["a Listing photo still referenced as JPEG", () => { state.media.push({ id: "m4", kind: "image", key: "pending/c/original.jpg", posterKey: null, thumbHash: null }); }],
    ["an image Message still referencing a JPEG", () => { state.messages.push({ id: "g5", kind: "image", metadata: { key: CHAT_KEY.replace(".webp", ".jpg") }, deletedAt: null }); }],
    ["a Profile Photo still referenced as JPEG", () => { state.users.push({ avatarKey: "profile/u2/original.jpeg", avatarUrl: null }); }],
    ["a JPEG object still stored", () => { state.objects.set("listing-photos/pending/old/original.jpg", Buffer.from("jpeg")); }],
  ])("refuses to apply or verify while %s, before the WebP conversion is verified", async (_label, leaveJpeg) => {
    await seedConvertedEnvironment();
    leaveJpeg();
    const before = snapshot();

    await expect(main(["apply"])).rejects.toThrow(/WebP conversion/);
    await expect(main(["verify"])).rejects.toThrow(/WebP conversion/);

    expect(snapshot()).toEqual(before);
  });

  it("fills every other photo, then fails naming a photo whose original is missing; verify fails until it has a hash", async () => {
    await seedConvertedEnvironment();
    state.objects.delete("listing-photos/pending/a/original.webp");

    await expect(main(["apply"])).rejects.toThrow("pending/a/original.webp");

    expect(state.messages[0]?.metadata?.["thumbHash"]).toBe(BLUE_HASH);
    await expect(main(["verify"])).rejects.toThrow(/1 Listing photos and 0 image Messages still lack a ThumbHash/);
  });

  it("fails verification on a stored hash that is not standard padded base64", async () => {
    await seedConvertedEnvironment();
    await main(["apply"]);
    const hashed = state.media.find((row) => row.id === "m2");
    if (!hashed) throw new Error("Missing fixture row");
    hashed.thumbHash = "1fsDBYCIiIiHiIdweIeHh4d4cIgH_";

    await expect(main(["verify"])).rejects.toThrow(/m2/);
  });
});
