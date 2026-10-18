import { describe, expect, it } from "vitest";

import { ErrorCode } from "../src/errors";
import { generateOpenApiDocument } from "../src/openapi";

type Schema = {
  $ref?: string;
  anyOf?: Schema[];
  allOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: string[];
};

const doc = generateOpenApiDocument() as {
  paths: Record<string, { post: { responses: Record<string, {
    content: { "application/json": { schema: Schema } };
  }> } }>;
  components: { schemas: Record<string, Schema> };
};

function expand(schema: Schema): Schema {
  if (schema.$ref) {
    return expand(doc.components.schemas[schema.$ref.split("/").at(-1)!]!);
  }
  if (!schema.allOf) return schema;
  const parts = schema.allOf.map(expand);
  return {
    properties: Object.assign({}, ...parts.map((part) => part.properties)),
    required: [...new Set(parts.flatMap((part) => part.required ?? []))],
  };
}

describe("Sign-in Code request OpenAPI errors", () => {
  it.each([
    "/api/v1/auth/otp/request",
    "/api/v1/account-deletion/request",
    "/api/v1/me/sign-in-methods/request",
  ])("types RATE_LIMITED details without narrowing other 400 errors on %s", (path) => {
    const response = expand(doc.paths[path]!.post.responses["400"]!.content["application/json"].schema);
    expect(response.anyOf).toHaveLength(2);
    const variants = response.anyOf!.map(expand);
    const rateLimited = variants.find((variant) => variant.properties?.code?.enum?.includes("RATE_LIMITED"));
    expect(rateLimited?.properties?.code?.enum).toEqual(["RATE_LIMITED"]);
    expect(rateLimited?.required).toContain("details");
    expect(expand(rateLimited!.properties!.details!)).toMatchObject({
      required: ["reason", "retryInSeconds"],
      properties: {
        reason: { type: "string", enum: ["destination_limit", "ip_limit", "backoff"] },
        retryInSeconds: { type: "integer", minimum: 0 },
      },
    });
    const other = variants.find((variant) => variant !== rateLimited)!;
    expect(other.properties?.code?.enum).toEqual(Object.values(ErrorCode).filter((code) => code !== "RATE_LIMITED"));
    expect(other.required).not.toContain("details");
    expect(other.properties?.details).toEqual({});
    for (const variant of variants) {
      expect(variant.required).toEqual(expect.arrayContaining(["statusCode", "code", "message", "timestamp", "requestId"]));
      expect(variant.properties).toMatchObject({
        statusCode: { type: "integer" },
        message: { type: "string" },
        timestamp: { type: "string", format: "date-time" },
        requestId: { type: "string", format: "uuid" },
      });
    }
  });
});
