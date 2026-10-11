import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DeleteObjectCommand, GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "./convert-photos-webp";

const state = vi.hoisted(() => ({ objects: new Map<string, { body: Buffer; contentType: string; etag: string }>(), rows: new Map<string, Record<string, unknown>[]>(), ignoreConditions: false }));
const missing = () => Object.assign(new Error("NotFound"), { name: "NotFound" });
const conflict = () => Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } });

vi.mock("@aws-sdk/client-s3", async (original) => ({ ...await original<typeof import("@aws-sdk/client-s3")>(), S3Client: class {
  destroy() {}
  async send(command: unknown) {
    if (command instanceof GetBucketVersioningCommand) return {};
    if (command instanceof ListObjectsV2Command) return { Contents: [...state.objects.entries()].filter(([key]) => key.startsWith(command.input.Bucket + "/")).map(([key, value]) => ({ Key: key.slice(command.input.Bucket!.length + 1), ETag: value.etag })) };
    if (command instanceof GetObjectCommand || command instanceof HeadObjectCommand || command instanceof PutObjectCommand || command instanceof DeleteObjectCommand) {
      const key = `${command.input.Bucket}/${command.input.Key}`;
      const object = state.objects.get(key);
      if (!state.ignoreConditions && command.input.IfMatch && object?.etag !== command.input.IfMatch) throw conflict();
      if (command instanceof PutObjectCommand) {
        if (!state.ignoreConditions && command.input.IfNoneMatch === "*" && object) throw conflict();
        const body = Buffer.from(command.input.Body as Buffer);
        const etag = '"' + createHash("sha256").update(body).digest("hex") + '"';
        state.objects.set(key, { body, etag, contentType: command.input.ContentType ?? "application/octet-stream" }); return { ETag: etag };
      }
      if (command instanceof DeleteObjectCommand) { state.objects.delete(key); return {}; }
      if (!object) throw missing();
      return { ETag: object.etag, ContentType: object.contentType, Body: { transformToByteArray: async () => object.body } };
    }
    throw new Error("Unexpected storage command");
  }
} }));

vi.mock("pg", () => ({ Pool: class {
  async end() {}
  async connect() { return { query: this.query.bind(this), release() {} }; }
  async query(sql: string, values: unknown[] = []) {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
    const table = /(?:FROM|UPDATE) "([^"]+)"/.exec(sql)?.[1];
    const rows = state.rows.get(table ?? "") ?? [];
    if (sql.startsWith("UPDATE")) {
      const row = rows.find((candidate) => candidate["id"] === values[values.length - 1]);
      if (!row) throw new Error("Missing fake row");
      const columns = [...sql.slice(0, sql.indexOf(" WHERE")).matchAll(/"([^"]+)"=\$/g)].map((match) => match[1]!);
      columns.forEach((column, index) => { const value = values[index]; row[column] = typeof value === "string" && value.startsWith("{") ? JSON.parse(value) : value; });
      return { rows: [], rowCount: 1 };
    }
    const columns = [...sql.slice(0, sql.indexOf(" FROM")).matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
    const selected = values.length ? rows.filter((row) => row["id"] === values[0]) : rows;
    return { rows: selected.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))), rowCount: selected.length };
  }
} }));

let directory: string;
let plan: string;
const prefix = "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "webp-conversion-")); plan = join(directory, "plan.json");
  state.objects.clear(); state.rows.clear(); state.ignoreConditions = false;
  for (const [name, value] of Object.entries({ DATABASE_URL: "postgresql://fake", MINIO_ENDPOINT: "http://fake", MINIO_ACCESS_KEY: "fake", MINIO_SECRET_KEY: "fake", PHOTO_CONVERSION_WRITERS_PAUSED: "yes" })) vi.stubEnv(name, value);
  const original = await sharp({ create: { width: 120, height: 90, channels: 3, background: "red" } }).jpeg().toBuffer();
  for (const name of ["original", "thumbnail", "list", "detail", "fullscreen"]) state.objects.set(`listing-photos/${prefix}/${name}.jpg`, { body: original, contentType: "image/jpeg", etag: `"${name}"` });
  const chat = "chat-attachments/conversation/photo/original.jpg";
  state.objects.set(`chat-attachments/${chat}`, { body: original, contentType: "image/jpeg", etag: '"chat"' });
  state.rows.set("listing_media", [{ id: "media-1", key: `${prefix}/original.jpg`, posterKey: null }]);
  state.rows.set("users", [{ id: "user-1", avatarKey: `${prefix}/original.jpg`, avatarUrl: null }]);
  state.rows.set("messages", [{ id: "message-1", metadata: { key: chat, snapshot: { coverMediaKey: `${prefix}/original.jpg` }, width: 120, height: 90 } }]);
  state.rows.set("media_uploads", [{ id: "upload-1", key: `${prefix}/original.jpg`, objectKeys: ["original.jpg", "thumbnail.jpg", "thumbnail.webp", "list.jpg", "list.webp", "detail.jpg", "detail.webp", "fullscreen.jpg", "fullscreen.webp"].map((name) => `${prefix}/${name}`), contentType: "image/jpeg", sizeBytes: original.length }]);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

describe("stored photo conversion", () => {
  it("inventories without writes, preserves identities/references, resumes, then deletes only after verification", async () => {
    await main(["dry-run", plan]);
    expect(state.objects.size).toBe(6);
    expect(JSON.parse(await readFile(plan, "utf8")).rows).toHaveLength(4);
    await main(["apply", plan]); await main(["apply", plan]); await main(["verify", plan]);
    expect(state.rows.get("listing_media")?.[0]).toEqual({ id: "media-1", key: `${prefix}/original.webp`, posterKey: null });
    expect(state.rows.get("users")?.[0]?.["id"]).toBe("user-1");
    expect(state.rows.get("messages")?.[0]).toEqual({ id: "message-1", metadata: { key: "chat-attachments/conversation/photo/original.webp", snapshot: { coverMediaKey: `${prefix}/original.webp` }, width: 120, height: 90 } });
    expect(state.rows.get("media_uploads")?.[0]?.["objectKeys"]).toHaveLength(5);
    const detail = await sharp(state.objects.get(`listing-photos/${prefix}/detail.webp`)!.body).metadata();
    expect([detail.width, detail.height]).toEqual([120, 90]);
    expect([...state.objects.keys()].filter((key) => key.endsWith(".jpg"))).toHaveLength(6);
    await main(["delete-jpeg", plan]); await main(["delete-jpeg", plan]);
    expect([...state.objects.keys()].filter((key) => key.endsWith(".jpg"))).toEqual([]);
    expect(state.objects.size).toBe(6);
  });

  it("refuses a changed reference rather than overwriting user content or deleting JPEGs", async () => {
    await main(["dry-run", plan]);
    state.rows.get("messages")![0]!["metadata"] = { key: "new-photo.webp" };
    await expect(main(["apply", plan])).rejects.toThrow("Concurrent change");
    await expect(main(["delete-jpeg", plan])).rejects.toThrow("old photo references");
    expect([...state.objects.keys()].filter((key) => key.endsWith(".jpg"))).toHaveLength(6);
  });

  it("normalizes existing WebP originals and refuses empty or corrupt photos", async () => {
    const bytes = await sharp({ create: { width: 90, height: 120, channels: 3, background: "red" } }).webp().withExif({ IFD0: { Make: "Camera" } }).toBuffer();
    state.objects.set("listing-photos/legacy/original.webp", { body: bytes, contentType: "image/webp", etag: '"legacy"' });
    await main(["dry-run", plan]); await main(["apply", plan]); await main(["apply", plan]);
    const original = await sharp(state.objects.get("listing-photos/legacy/original.webp")!.body).metadata();
    expect(original.exif).toBeUndefined();
    expect([original.width, original.height]).toEqual([90, 120]);
    expect((await sharp(state.objects.get("listing-photos/legacy/fullscreen.webp")!.body).metadata()).width).toBe(90);
    state.objects.set("chat-attachments/empty.jpg", { body: Buffer.alloc(0), contentType: "image/jpeg", etag: '"empty"' });
    const nextPlan = join(directory, "empty-plan.json");
    await main(["dry-run", nextPlan]);
    await expect(main(["apply", nextPlan])).rejects.toThrow();
    expect(state.objects.has("chat-attachments/empty.jpg")).toBe(true);
  });

  it("fails closed when the object store ignores conditional writes or deletes", async () => {
    await main(["dry-run", plan]); state.ignoreConditions = true;
    await expect(main(["apply", plan])).rejects.toThrow("ignores conditional");
    expect(state.rows.get("listing_media")?.[0]?.["key"]).toBe(`${prefix}/original.jpg`);
  });
});
