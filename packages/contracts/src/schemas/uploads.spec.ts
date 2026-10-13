import { describe, expect, it } from "vitest";

import { PresignRequestSchema, PresignResponseSchema } from "./uploads";

const legacy = {
  uploadUrl: "https://media.example.test/signed", key: "pending/photo/original.webp",
  expiresIn: 600, maxSizeBytes: 5_242_880,
};

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
