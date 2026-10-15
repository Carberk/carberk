import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, it } from "vitest";

const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint);

/** Execute the isolated V1 protocol proof in the API CI lane with disposable MinIO. */
describe.skipIf(!hosted)("video protocol owned-storage proof (#889)", () => {
  it("exercises the actual multipart store without registering production video endpoints", async () => {
    await promisify(execFile)(process.execPath, ["--test", resolve(process.cwd(), "../../scripts/video-protocol-storage.test.mjs")], {
      timeout: 30_000, maxBuffer: 1024 * 1024,
    });
  }, 35_000);
});
