import { describe, expect, it } from "vitest";

import { UploadObjectInvalidDetailsSchema } from "./errors";
import { generateOpenApiDocument } from "./openapi";

describe("upload object refusal contract", () => {
  it("declares client photo references and rejects an internal upload id", () => {
    expect(UploadObjectInvalidDetailsSchema.parse({ key: "pending/photo/original.webp" })).toEqual({ key: "pending/photo/original.webp" });
    expect(UploadObjectInvalidDetailsSchema.safeParse({ key: "photo.webp", uploadId: "private-id" }).success).toBe(false);
    expect(UploadObjectInvalidDetailsSchema.safeParse({ key: "photo.webp", photoId: "00000000-0000-4000-8000-000000000005" }).success).toBe(true);
  });

  it("uses one refusal schema in attach, publish and Profile Photo OpenAPI responses", () => {
    const doc = generateOpenApiDocument() as {
      paths: Record<string, Partial<Record<"post" | "put", { responses: Record<string, unknown> }>>>;
      components?: { schemas?: Record<string, unknown> };
    };
    for (const [path, method] of [
      ["/api/v1/listings/{id}/media/attach", "post"],
      ["/api/v1/listings/drafts/{id}/publish", "post"],
      ["/api/v1/me/photo", "put"],
    ] as const) {
      const operation = doc.paths[path]?.[method];
      const response = operation?.responses["400"];
      expect(JSON.stringify(response)).toContain("#/components/schemas/UploadObjectInvalidResponse");
    }
    expect(doc.components?.schemas?.["UploadObjectInvalidDetails"]).toMatchObject({
      properties: { key: { type: "string" }, photoId: { type: "string", format: "uuid" } },
      additionalProperties: false,
    });
  });
});
