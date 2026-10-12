import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../../env.schema";
import { MinioMediaStorageAdapter } from "./MinioMediaStorageAdapter";

const awsMocks = vi.hoisted(() => ({
  clients: [] as Array<{ endpoint: string; sent: unknown[] }>,
  signedClient: undefined as undefined | { endpoint: string; sent: unknown[] },
  signedCommand: undefined as undefined | { input: Record<string, unknown> },
  sendResult: undefined as undefined | (() => Promise<unknown>),
  versioning: undefined as string | undefined,
  conditionalSupported: true,
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    endpoint: string;
    sent: unknown[] = [];

    constructor(config: { endpoint: string }) {
      this.endpoint = config.endpoint;
      awsMocks.clients.push(this);
    }

    private objects = new Map<string, string>();

    async send(command: unknown): Promise<unknown> {
      this.sent.push(command);
      const input = (command as { input: Record<string, unknown> }).input;
      if (command instanceof GetBucketVersioningCommand) return { Status: awsMocks.versioning };
      const key = String(input["Key"]);
      const probe = key.endsWith("/.conditional-probe");
      if (!probe && awsMocks.sendResult) {
        const result = await awsMocks.sendResult();
        if (command instanceof PutObjectCommand) this.objects.set(key, '"placeholder"');
        return result;
      }
      if (command instanceof PutObjectCommand) {
        if (awsMocks.conditionalSupported && (
          (input["IfMatch"] && input["IfMatch"] !== this.objects.get(key)) ||
          (input["IfNoneMatch"] === "*" && this.objects.has(key))
        )) throw Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } });
        this.objects.set(key, '"placeholder"');
        return { ETag: '"placeholder"' };
      }
      if (command instanceof DeleteObjectCommand) { this.objects.delete(key); return {}; }
      if (command instanceof HeadObjectCommand) {
        if (!this.objects.has(key)) throw Object.assign(new Error("NotFound"), { name: "NotFound" });
        return { ETag: this.objects.get(key) };
      }
      return {};
    }
  }

  class PutObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class HeadObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class GetBucketVersioningCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  return { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetBucketVersioningCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(
    async (
      client: { endpoint: string; sent: unknown[] },
      command: { input: Record<string, unknown> },
    ) => {
      awsMocks.signedClient = client;
      awsMocks.signedCommand = command;
      return `${client.endpoint}/signed/${command.input["Bucket"]}/${command.input["Key"]}`;
    },
  ),
}));

function makeAdapter(publicUrl: string, endpoint = "http://minio.internal:9000") {
  awsMocks.clients.length = 0;
  awsMocks.signedClient = undefined;
  awsMocks.signedCommand = undefined;
  awsMocks.sendResult = undefined;
  awsMocks.versioning = undefined;
  awsMocks.conditionalSupported = true;

  const config = {
    get: vi.fn((key: keyof Env) => {
      switch (key) {
        case "MINIO_ENDPOINT":
          return endpoint;
        case "MINIO_ACCESS_KEY":
          return "access-key";
        case "MINIO_SECRET_KEY":
          return "secret-key";
        case "MINIO_REGION":
          return "us-east-1";
        case "MINIO_PUBLIC_URL":
          return publicUrl;
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService<Env, true>;

  return new MinioMediaStorageAdapter(config);
}

describe("MinioMediaStorageAdapter", () => {
  it("resolves public URL for listing photo keys", () => {
    const adapter = makeAdapter("https://media.auto.tm");

    const url = adapter.resolvePublicUrl("pending/uuid/original.webp");

    expect(url).toBe(
      "https://media.auto.tm/listing-photos/pending/uuid/original.webp",
    );
  });

  it("resolves public URL for listing video keys", () => {
    const adapter = makeAdapter("https://media.auto.tm");

    const url = adapter.resolvePublicUrl("pending/uuid/original.mp4");

    expect(url).toBe(
      "https://media.auto.tm/listing-videos/pending/uuid/original.mp4",
    );
  });

  it("resolves the full chat object key inside the chat bucket", () => {
    const adapter = makeAdapter("https://media.auto.tm");

    const url = adapter.resolvePublicUrl(
      "chat-attachments/conv-1/uuid/original.webp",
    );

    expect(url).toBe(
      "https://media.auto.tm/chat-attachments/chat-attachments/conv-1/uuid/original.webp",
    );
  });

  it.each(["http://media.example.com/photo.webp", "https://cdn.example.com/photo.webp"])(
    "preserves an already-public URL %s",
    (url) => {
      expect(makeAdapter("https://media.auto.tm").resolvePublicUrl(url)).toBe(url);
    },
  );

  it("addresses the same bucket and full key used by chat upload", async () => {
    const adapter = makeAdapter("https://media.auto.tm");
    const key = "chat-attachments/conv-1/uuid/original.webp";
    const result = await adapter.presignUpload({ key, contentType: "image/webp", sizeBytes: 1024 });

    expect(result.key).toBe(key);
    expect(awsMocks.signedCommand?.input).toMatchObject({ Bucket: "chat-attachments", Key: key });
    expect(adapter.resolvePublicUrl(result.key)).toBe(
      `https://media.auto.tm/${awsMocks.signedCommand?.input["Bucket"]}/${awsMocks.signedCommand?.input["Key"]}`,
    );
  });

  it("strips trailing slash from public URL", () => {
    const adapter = makeAdapter("https://media.auto.tm/");

    const url = adapter.resolvePublicUrl("pending/uuid/original.webp");

    expect(url).toBe(
      "https://media.auto.tm/listing-photos/pending/uuid/original.webp",
    );
  });

  it("uses the public endpoint when signing direct PUT uploads", async () => {
    const adapter = makeAdapter(
      "https://media.auto.tm",
      "http://minio.railway.internal:9000",
    );

    const result = await adapter.presignUpload({
      key: "pending/uuid/original.webp",
      contentType: "image/webp",
      sizeBytes: 1024,
    });

    expect(awsMocks.clients.map((client) => client.endpoint)).toEqual([
      "http://minio.railway.internal:9000",
      "https://media.auto.tm",
    ]);
    expect(awsMocks.signedClient?.endpoint).toBe("https://media.auto.tm");
    expect(awsMocks.signedCommand?.input).toMatchObject({
      Bucket: "listing-photos",
      Key: "pending/uuid/original.webp",
      ContentType: "image/webp",
    });
    expect(result.url).toBe(
      "https://media.auto.tm/signed/listing-photos/pending/uuid/original.webp",
    );
  });

  it("requires the placeholder ETag in the signed Listing image PUT (#725)", async () => {
    const adapter = makeAdapter("https://media.auto.tm");
    awsMocks.sendResult = async () => ({ ETag: '"placeholder"' });
    const result = await adapter.presignUpload({
      key: "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp",
      contentType: "image/webp",
      sizeBytes: 1024,
      ...{ writeProtocol: "conditional-v1" as const },
    });

    expect(result).toMatchObject({ headers: { "if-match": '"placeholder"' } });
    expect(awsMocks.signedCommand?.input).toMatchObject({ IfMatch: '"placeholder"' });
    expect(awsMocks.signedCommand?.input["CacheControl"]).toBe("no-store");
    expect(result.headers?.["cache-control"]).toBe("no-store");
  });

  it("initializes the fixed original and four variants before issuing conditional upload authority (#725)", async () => {
    const adapter = makeAdapter("https://media.auto.tm");
    const initialized = new Set<string>();
    awsMocks.sendResult = async () => {
      const command = awsMocks.clients[0]?.sent.at(-1) as { input: Record<string, unknown> };
      if (command.input["Key"] && command.input["Body"] !== undefined) {
        initialized.add(String(command.input["Key"]));
      }
      return { ETag: '"placeholder"' };
    };
    await adapter.presignUpload({
      key: "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp",
      contentType: "image/webp", sizeBytes: 1024,
      ...{ writeProtocol: "conditional-v1" as const },
    });

    expect([...initialized].sort()).toEqual([
      "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp",
      "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/thumbnail.webp",
      "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/list.webp",
      "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/detail.webp",
      "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/fullscreen.webp",
    ].sort());
  });

  it("returns no conditional upload authority when initialization fails (#725)", async () => {
    const adapter = makeAdapter("https://media.auto.tm");
    awsMocks.sendResult = async () => { throw new Error("storage unavailable"); };

    await expect(adapter.presignUpload({
      key: "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp",
      contentType: "image/webp", sizeBytes: 1024,
      ...{ writeProtocol: "conditional-v1" as const },
    })).rejects.toThrow("storage unavailable");
    expect(awsMocks.signedCommand).toBeUndefined();
  });

  it.each(["Enabled", "Suspended"])("refuses conditional authority on a %s versioned bucket", async (status) => {
    const adapter = makeAdapter("https://media.auto.tm");
    awsMocks.versioning = status;
    await expect(adapter.presignUpload({
      key: "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp",
      contentType: "image/webp", sizeBytes: 1024, writeProtocol: "conditional-v1",
    })).rejects.toThrow("unversioned bucket");
    expect(awsMocks.signedCommand).toBeUndefined();
  });

  it("refuses conditional authority when the provider ignores If-Match", async () => {
    const adapter = makeAdapter("https://media.auto.tm");
    awsMocks.conditionalSupported = false;
    await expect(adapter.presignUpload({
      key: "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp",
      contentType: "image/webp", sizeBytes: 1024, writeProtocol: "conditional-v1",
    })).rejects.toThrow("does not enforce conditional writes");
    expect(awsMocks.signedCommand).toBeUndefined();
  });

  it("uses the private endpoint for administrative object deletion", async () => {
    const adapter = makeAdapter(
      "https://media.auto.tm",
      "http://minio.railway.internal:9000",
    );

    await adapter.deleteObject("pending/uuid/original.webp");

    expect(awsMocks.clients[0]?.sent).toHaveLength(1);
    expect(awsMocks.clients[1]?.sent).toHaveLength(0);
  });

  describe("inspect", () => {
    it("reports the stored content type and size from the private endpoint", async () => {
      const adapter = makeAdapter("https://media.auto.tm");
      awsMocks.sendResult = async () => ({ ContentType: "image/webp", ContentLength: 2048 });

      const info = await adapter.inspect("pending/uuid/original.webp");

      expect(info).toEqual({ contentType: "image/webp", sizeBytes: 2048 });
      expect(awsMocks.clients[0]?.sent).toHaveLength(1);
      expect(awsMocks.clients[0]?.sent[0]).toMatchObject({
        input: { Bucket: "listing-photos", Key: "pending/uuid/original.webp" },
      });
    });

    it("looks up videos in the video bucket", async () => {
      const adapter = makeAdapter("https://media.auto.tm");
      awsMocks.sendResult = async () => ({ ContentType: "video/mp4", ContentLength: 10 });

      await adapter.inspect("pending/uuid/original.mp4");

      expect(awsMocks.clients[0]?.sent[0]).toMatchObject({
        input: { Bucket: "listing-videos" },
      });
    });

    it.each([
      ["NotFound", { name: "NotFound" }],
      ["NoSuchKey", { name: "NoSuchKey" }],
      ["a 404 response", { name: "Unknown", $metadata: { httpStatusCode: 404 } }],
    ])("returns null when the object is missing (%s)", async (_label, failure) => {
      const adapter = makeAdapter("https://media.auto.tm");
      awsMocks.sendResult = async () => {
        throw Object.assign(new Error("missing"), failure);
      };

      await expect(adapter.inspect("pending/uuid/original.webp")).resolves.toBeNull();
    });

    it("surfaces other storage failures instead of treating the object as missing", async () => {
      const adapter = makeAdapter("https://media.auto.tm");
      awsMocks.sendResult = async () => {
        throw Object.assign(new Error("denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
      };

      await expect(adapter.inspect("pending/uuid/original.webp")).rejects.toThrow("denied");
    });
  });
});
