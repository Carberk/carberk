import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PresignRequestSchema, PresignResponseSchema, RenewPhotoUploadRequestSchema, RenewPhotoUploadRefusalSchema } from "./uploads";

const legacy = {
  uploadUrl: "https://media.example.test/signed", key: "pending/photo/original.webp",
  expiresIn: 600, maxSizeBytes: 5_242_880,
};

it("renews only a fixed pending WebP identity and declared metadata, never a caller's storage authority", () => {
  const request = { key: "pending/21b0b4e0-4d4a-4d2c-8bd6-705555cb7585/original.webp", contentType: "image/webp", sizeBytes: 1024 };
  expect(RenewPhotoUploadRequestSchema.parse(request)).toEqual(request);
  for (const change of [{ key: "https://storage.test/photo" }, { contentType: "image/jpeg" }, { sizeBytes: 0 }, { sizeBytes: 5242881 }, { etag: '"completed"' }, { uploadUrl: "https://other.test" }]) {
    expect(RenewPhotoUploadRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
  }
});

it.each(["VALIDATION_FAILED", "UPLOAD_NOT_AVAILABLE"])("preserves the actual %s renewal refusal envelope and details", code => {
  const response = { statusCode: 400, code, message: "Photo renewal refused", details: { reason: "unchanged" },
    timestamp: "2026-11-15T00:00:00.000Z", requestId: "11111111-1111-4111-8111-111111111111" };
  expect(RenewPhotoUploadRefusalSchema.parse(response)).toEqual(response);
});

it("publishes the renewal refusal codes in the generated HTTP response contract", () => {
  const document = JSON.parse(readFileSync("openapi.json", "utf8"));
  const response = document.paths["/api/v1/uploads/renew"].post.responses["400"].content["application/json"].schema;
  expect(response).toEqual({ $ref: "#/components/schemas/RenewPhotoUploadRefusal" });
  expect(document.components.schemas.RenewPhotoUploadRefusal.properties.code.enum).toEqual(["VALIDATION_FAILED", "UPLOAD_NOT_AVAILABLE"]);
});

describe("additive conditional upload contract", () => {
  it("keeps the installed client's request and legacy response valid", () => {
    expect(PresignRequestSchema.parse({ kind: "image", contentType: "image/webp", sizeBytes: 1024 }))
      .toEqual({ kind: "image", contentType: "image/webp", sizeBytes: 1024 });
    expect(PresignResponseSchema.parse(legacy)).toEqual(legacy);
  });

  it("preserves the quoted signed ETag header through client response parsing", () => {
    expect(PresignResponseSchema.parse({ ...legacy,
      headers: { "if-match": '"placeholder"', "content-type": "image/webp" },
    })).toEqual({ ...legacy, headers: { "if-match": '"placeholder"', "content-type": "image/webp" } });
  });

  it("does not expose private manifest or provenance through the client contract", () => {
    expect(PresignResponseSchema.parse({ ...legacy, uploadId: "private-upload",
      objectKeys: ["private-manifest"], writeProtocol: "conditional-v1",
    })).toEqual(legacy);
  });

  it("refuses a malformed header record and unsupported protocol", () => {
    expect(PresignResponseSchema.safeParse({ ...legacy, headers: { "if-match": {} } }).success).toBe(false);
    expect(PresignRequestSchema.safeParse({ kind: "image", contentType: "image/webp", sizeBytes: 1024,
      writeProtocol: "unconditional-fallback",
    }).success).toBe(false);
  });
});
