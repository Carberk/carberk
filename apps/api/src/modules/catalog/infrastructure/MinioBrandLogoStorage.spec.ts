import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../../../env.schema";
import { MinioBrandLogoStorage } from "./MinioBrandLogoStorage";

const storage = new MinioBrandLogoStorage(new ConfigService<Env, true>({
  MINIO_ENDPOINT: "http://127.0.0.1:9000",
  MINIO_PUBLIC_URL: "https://media.example/",
  MINIO_REGION: "us-east-1",
  MINIO_ACCESS_KEY: "test",
  MINIO_SECRET_KEY: "test-secret",
}));

describe("MinioBrandLogoStorage public URLs", () => {
  it("preserves existing ASCII URLs", () => {
    expect(storage.publicUrl("brands/toyota/imp-abc123/logo.png")).toBe(
      "https://media.example/catalog-assets/brands/toyota/imp-abc123/logo.png",
    );
  });

  it.each([
    ["iž", "i%C5%BE"],
    ["москвич", "%D0%BC%D0%BE%D1%81%D0%BA%D0%B2%D0%B8%D1%87"],
    ["паз", "%D0%BF%D0%B0%D0%B7"],
    ["tofaş", "tofa%C5%9F"],
  ])("encodes catalog slug %s without changing separators", (slug, encoded) => {
    expect(storage.publicUrl(`brands/${slug}/imp-abc/logo.png`)).toBe(
      `https://media.example/catalog-assets/brands/${encoded}/imp-abc/logo.png`,
    );
  });

  it("encodes every segment, including URL delimiters and literal percent signs", () => {
    expect(storage.publicUrl("бренды/tofaş/v 1/logo#?%.png")).toBe(
      "https://media.example/catalog-assets/%D0%B1%D1%80%D0%B5%D0%BD%D0%B4%D1%8B/tofa%C5%9F/v%201/logo%23%3F%25.png",
    );
  });
});

describe("MinioBrandLogoStorage.deleteLogoVersion", () => {
  const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const directory = `brands/toyota/imp-0123456789ab-${UUID}/`;

  type Sent = { name: string; input: Record<string, unknown> };


  function withFakeS3(respond: (sent: Sent) => unknown) {
    const calls: Sent[] = [];
    const client = (storage as unknown as { s3: S3Client }).s3;
    const send = vi.spyOn(client, "send").mockImplementation((async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      const sent = { name: command.constructor.name, input: command.input };
      calls.push(sent);
      return respond(sent);
    }) as never);
    return { calls, send };
  }

  const keysIn = (calls: Sent[]) =>
    calls
      .filter((c) => c.name === DeleteObjectsCommand.name)
      .map((c) => ((c.input["Delete"] as { Objects: { Key: string }[] }).Objects).map((o) => o.Key));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists every page of the stored directory and deletes all four imported files", async () => {
    const files = ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"].map((f) => `${directory}${f}`);
    const { calls } = withFakeS3((sent) => {
      if (sent.name === ListObjectsV2Command.name) {
        const token = sent.input["ContinuationToken"] as string | undefined;
        return token === undefined
          ? { Contents: files.slice(0, 2).map((Key) => ({ Key })), NextContinuationToken: "page-2" }
          : { Contents: files.slice(2).map((Key) => ({ Key })) };
      }
      return {};
    });

    await storage.deleteLogoVersion(`${directory}logo.png`);

    const lists = calls.filter((c) => c.name === ListObjectsV2Command.name);
    expect(lists.map((c) => [c.input["Bucket"], c.input["Prefix"], c.input["ContinuationToken"]])).toEqual([
      ["catalog-assets", directory, undefined],
      ["catalog-assets", directory, "page-2"],
    ]);
    expect(keysIn(calls).flat().sort()).toEqual([...files].sort());
  });

  it("uses the stored slug in the prefix, not any current brand slug", async () => {
    const { calls } = withFakeS3(() => ({ Contents: [] }));

    await storage.deleteLogoVersion(`brands/renamed-away/v1790000000000-${UUID}/logo.webp`);

    expect(calls[0]?.input["Prefix"]).toBe(`brands/renamed-away/v1790000000000-${UUID}/`);
  });

  it("deletes in batches of at most 1000 keys", async () => {
    const all = Array.from({ length: 2_500 }, (_, i) => `${directory}extra-${String(i).padStart(4, "0")}.png`);
    const { calls } = withFakeS3((sent) => {
      if (sent.name === ListObjectsV2Command.name) {
        const token = sent.input["ContinuationToken"] as string | undefined;
        const start = token === undefined ? 0 : Number(token);
        const end = Math.min(start + 1_000, all.length);
        return {
          Contents: all.slice(start, end).map((Key) => ({ Key })),
          ...(end < all.length ? { NextContinuationToken: String(end) } : {}),
        };
      }
      return {};
    });

    await storage.deleteLogoVersion(`${directory}logo.png`);

    const batches = keysIn(calls);
    expect(batches.map((b) => b.length)).toEqual([1_000, 1_000, 500]);
    expect(batches.flat()).toEqual(all);
  });

  it("reports partial delete errors after attempting every batch", async () => {
    const all = Array.from({ length: 1_500 }, (_, i) => `${directory}extra-${i}.png`);
    let deletes = 0;
    const { calls } = withFakeS3((sent) => {
      if (sent.name === ListObjectsV2Command.name) return { Contents: all.map((Key) => ({ Key })) };
      deletes += 1;
      return deletes === 1
        ? { Errors: [{ Key: all[3], Code: "AccessDenied", Message: "no delete for you" }] }
        : {};
    });

    const failure = await storage.deleteLogoVersion(`${directory}logo.png`).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(all[3]);
    expect((failure as Error).message).toContain("AccessDenied");
    expect(keysIn(calls)).toHaveLength(2);
  });

  it("propagates a failed or uncertain storage request", async () => {
    withFakeS3(() => {
      throw new Error("socket hang up");
    });

    await expect(storage.deleteLogoVersion(`${directory}logo.png`)).rejects.toThrow("socket hang up");
  });

  it("deletes nothing when the directory is already empty", async () => {
    const { calls } = withFakeS3(() => ({ Contents: [] }));

    await storage.deleteLogoVersion(`${directory}logo.png`);

    expect(keysIn(calls)).toEqual([]);
  });

  it("deletes a key outside a recognized directory as a single object", async () => {
    const { calls } = withFakeS3(() => ({}));

    await storage.deleteLogoVersion("brands/toyota/custom/logo.png");

    expect(calls.map((c) => c.name)).toEqual([DeleteObjectCommand.name]);
    expect(calls[0]?.input).toMatchObject({ Bucket: "catalog-assets", Key: "brands/toyota/custom/logo.png" });
  });
});
