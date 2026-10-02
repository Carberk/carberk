import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../../env.schema";
import { MinioMediaStorageAdapter } from "./MinioMediaStorageAdapter";

const awsMocks = vi.hoisted(() => ({
  clients: [] as Array<{ endpoint: string; sent: unknown[] }>,
  signedClient: undefined as undefined | { endpoint: string; sent: unknown[] },
  signedCommand: undefined as undefined | { input: Record<string, unknown> },
  sendResult: undefined as undefined | (() => Promise<unknown>),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    endpoint: string;
    sent: unknown[] = [];

    constructor(config: { endpoint: string }) {
      this.endpoint = config.endpoint;
      awsMocks.clients.push(this);
    }

    async send(command: unknown): Promise<unknown> {
      this.sent.push(command);
      return awsMocks.sendResult?.();
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

  return { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand };
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

    const url = adapter.resolvePublicUrl("pending/uuid/original.jpg");

    expect(url).toBe(
      "https://media.auto.tm/listing-photos/pending/uuid/original.jpg",
    );
  });

  it("resolves public URL for listing video keys", () => {
    const adapter = makeAdapter("https://media.auto.tm");

    const url = adapter.resolvePublicUrl("pending/uuid/original.mp4");

    expect(url).toBe(
      "https://media.auto.tm/listing-videos/pending/uuid/original.mp4",
    );
  });

  it("resolves public URL for chat-attachment keys without doubling the bucket", () => {
    const adapter = makeAdapter("https://media.auto.tm");

    const url = adapter.resolvePublicUrl(
      "chat-attachments/conv-1/uuid/original.jpg",
    );

    expect(url).toBe(
      "https://media.auto.tm/chat-attachments/conv-1/uuid/original.jpg",
    );
  });

  it("strips trailing slash from public URL", () => {
    const adapter = makeAdapter("https://media.auto.tm/");

    const url = adapter.resolvePublicUrl("pending/uuid/original.jpg");

    expect(url).toBe(
      "https://media.auto.tm/listing-photos/pending/uuid/original.jpg",
    );
  });

  it("uses the public endpoint when signing direct PUT uploads", async () => {
    const adapter = makeAdapter(
      "https://media.auto.tm",
      "http://minio.railway.internal:9000",
    );

    const result = await adapter.presignUpload({
      key: "pending/uuid/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(awsMocks.clients.map((client) => client.endpoint)).toEqual([
      "http://minio.railway.internal:9000",
      "https://media.auto.tm",
    ]);
    expect(awsMocks.signedClient?.endpoint).toBe("https://media.auto.tm");
    expect(awsMocks.signedCommand?.input).toMatchObject({
      Bucket: "listing-photos",
      Key: "pending/uuid/original.jpg",
      ContentType: "image/jpeg",
    });
    expect(result.url).toBe(
      "https://media.auto.tm/signed/listing-photos/pending/uuid/original.jpg",
    );
  });

  it("uses the private endpoint for administrative object deletion", async () => {
    const adapter = makeAdapter(
      "https://media.auto.tm",
      "http://minio.railway.internal:9000",
    );

    await adapter.deleteObject("pending/uuid/original.jpg");

    expect(awsMocks.clients[0]?.sent).toHaveLength(1);
    expect(awsMocks.clients[1]?.sent).toHaveLength(0);
  });

  describe("inspect", () => {
    it("reports the stored content type and size from the private endpoint", async () => {
      const adapter = makeAdapter("https://media.auto.tm");
      awsMocks.sendResult = async () => ({ ContentType: "image/jpeg", ContentLength: 2048 });

      const info = await adapter.inspect("pending/uuid/original.jpg");

      expect(info).toEqual({ contentType: "image/jpeg", sizeBytes: 2048 });
      expect(awsMocks.clients[0]?.sent).toHaveLength(1);
      expect(awsMocks.clients[0]?.sent[0]).toMatchObject({
        input: { Bucket: "listing-photos", Key: "pending/uuid/original.jpg" },
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

      await expect(adapter.inspect("pending/uuid/original.jpg")).resolves.toBeNull();
    });

    it("surfaces other storage failures instead of treating the object as missing", async () => {
      const adapter = makeAdapter("https://media.auto.tm");
      awsMocks.sendResult = async () => {
        throw Object.assign(new Error("denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
      };

      await expect(adapter.inspect("pending/uuid/original.jpg")).rejects.toThrow("denied");
    });
  });
});
