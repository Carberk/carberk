import { describe, expect, it } from "vitest";

import { generateOpenApiDocument, VehicleHistorySchemas } from "../src/index";

describe("synthetic History desk contract", () => {
  it("exports a consumable empty array in OpenAPI", () => {
    const document = generateOpenApiDocument() as {
      components: { schemas: Record<string, { properties?: { requests?: unknown } }> };
      paths: Record<string, unknown>;
    };
    expect(document.components.schemas["HistoryDesk"]?.properties?.requests).toEqual({
      type: "array", items: {}, minItems: 0, maxItems: 0,
    });
    expect(JSON.stringify(document.paths["/api/v1/vehicle-history/desk"])).not.toContain('"anyOf":[]');
  });

  it.each([
    { requests: [], accepted: true },
    { requests: [{}], accepted: false },
    { requests: ["request"], accepted: false },
  ])("accepts only an empty request list: $requests", ({ requests, accepted }) => {
    const result = VehicleHistorySchemas.HistoryDeskSchema.safeParse({
      purpose: "vehicle-history", mode: "synthetic", requests,
      actor: { id: "11750000-0000-4000-8000-000000000001", displayName: null, nameNumber: 1175 },
    });
    expect(result.success).toBe(accepted);
  });
});
