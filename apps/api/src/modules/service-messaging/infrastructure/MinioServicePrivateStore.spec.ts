import { ConfigService } from "@nestjs/config";
import { beforeEach, expect, it, vi } from "vitest";
import { MinioServicePrivateStore } from "./MinioServicePrivateStore";

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", async (original) => ({ ...await original<typeof import("@aws-sdk/client-s3")>(), S3Client: class { send = send; } }));
const config = () => new ConfigService({ MINIO_ENDPOINT: "http://127.0.0.1:9000", MINIO_REGION: "us-east-1", MINIO_ACCESS_KEY: "synthetic", MINIO_SECRET_KEY: "synthetic-secret" });
beforeEach(() => send.mockReset());
it("writes immutable private bytes with browser caching disabled", async () => {
 send.mockResolvedValue({});
 await new MinioServicePrivateStore(config()).putImmutable("service-private/c/f/hash", new Uint8Array([1, 2]), "image/jpeg");
 const write = send.mock.calls[0]?.[0].input;
 expect(write).toMatchObject({ Bucket: "service-private", Key: "service-private/c/f/hash", IfNoneMatch: "*", CacheControl: "no-store, private", ContentDisposition: "attachment" });
 expect(write).not.toHaveProperty("ACL", "public-read");
});
it("refuses files larger than the authorized size without returning bytes", async () => {
 send.mockResolvedValue({ ContentLength: 3, Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
 await expect(new MinioServicePrivateStore(config()).get("service-private/c/f/hash", 2)).rejects.toBeDefined();
});
it("does not treat an existing immutable object as a successful replacement", async () => {
 send.mockRejectedValue(Object.assign(new Error("Precondition failed"), { $metadata: { httpStatusCode: 412 } }));
 await expect(new MinioServicePrivateStore(config()).putImmutable("service-private/c/f/hash", new Uint8Array([1, 2]), "image/jpeg")).rejects.toBeDefined();
});
