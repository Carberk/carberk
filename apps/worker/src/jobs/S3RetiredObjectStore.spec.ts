import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3RetiredObjectStore } from "./S3RetiredObjectStore";

// Issue #721: deleting must mean the bytes are gone. A delete marker on a
// versioned bucket, or a key that still answers HEAD, is not deletion.

const KEYS = ["pending/a/original.jpg", "pending/a/thumbnail.jpg", "pending/a/list.webp"];

function notFound(): Error {
  return Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
}

/** A bucket as S3 answers it; `undeletable` keys survive DeleteObject. */
class FakeBucket {
  objects = new Set(KEYS);
  versioning: "Enabled" | "Suspended" | undefined;
  versioningError: Error | undefined;
  deleteMarker = false;
  undeletable = new Set<string>();
  headError: Error | undefined;
  commands: string[] = [];

  send = async (command: unknown): Promise<unknown> => {
    if (command instanceof GetBucketVersioningCommand) {
      this.commands.push("versioning");
      if (this.versioningError) throw this.versioningError;
      return this.versioning ? { Status: this.versioning } : {};
    }
    if (command instanceof DeleteObjectCommand) {
      const key = command.input.Key as string;
      this.commands.push(`delete ${key}`);
      if (!this.undeletable.has(key)) this.objects.delete(key);
      return this.deleteMarker ? { DeleteMarker: true, VersionId: "v2" } : {};
    }
    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key as string;
      this.commands.push(`head ${key}`);
      if (this.headError) throw this.headError;
      if (!this.objects.has(key)) throw notFound();
      return { ContentLength: 1 };
    }
    throw new Error("Unexpected storage command");
  };
}

function setup() {
  const bucket = new FakeBucket();
  return { bucket, store: new S3RetiredObjectStore(bucket as never) };
}

const deletes = (bucket: FakeBucket) => bucket.commands.filter((command) => command.startsWith("delete"));

describe("S3RetiredObjectStore (#721)", () => {
  it("deletes every key and proves each one absent", async () => {
    const { bucket, store } = setup();

    await store.deleteAndVerify(KEYS);

    expect(bucket.objects.size).toBe(0);
    expect(bucket.commands).toEqual([
      "versioning",
      ...KEYS.map((key) => `delete ${key}`),
      ...KEYS.map((key) => `head ${key}`),
    ]);
  });

  it("succeeds again when a retry finds some keys already deleted", async () => {
    const { bucket, store } = setup();
    bucket.objects.delete(KEYS[0] as string);

    await expect(store.deleteAndVerify(KEYS)).resolves.toBeUndefined();
    expect(bucket.objects.size).toBe(0);
  });

  it.each(["Enabled", "Suspended"] as const)("deletes nothing on a bucket with versioning %s", async (status) => {
    const { bucket, store } = setup();
    bucket.versioning = status;

    await expect(store.deleteAndVerify(KEYS)).rejects.toThrow(/version/i);
    expect(deletes(bucket)).toEqual([]);
    expect(bucket.objects.size).toBe(3);
  });

  it("deletes nothing when the versioning state cannot be read", async () => {
    const { bucket, store } = setup();
    bucket.versioningError = Object.assign(new Error("AccessDenied"), { $metadata: { httpStatusCode: 403 } });

    await expect(store.deleteAndVerify(KEYS)).rejects.toThrow("AccessDenied");
    expect(deletes(bucket)).toEqual([]);
  });

  it("does not report success when storage answers a delete with a marker", async () => {
    const { bucket, store } = setup();
    bucket.deleteMarker = true;

    await expect(store.deleteAndVerify(KEYS)).rejects.toThrow(/marker|version/i);
  });

  it("does not report success while any key still exists", async () => {
    const { bucket, store } = setup();
    bucket.undeletable.add(KEYS[2] as string);

    await expect(store.deleteAndVerify(KEYS)).rejects.toThrow(KEYS[2]);
  });

  it("does not take a failed existence check for absence", async () => {
    const { bucket, store } = setup();
    bucket.headError = Object.assign(new Error("SlowDown"), { $metadata: { httpStatusCode: 503 } });

    await expect(store.deleteAndVerify(KEYS)).rejects.toThrow("SlowDown");
  });
});
