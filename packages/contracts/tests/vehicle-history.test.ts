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

describe("private enquiry consumer contract", () => {
  it("documents exactly the four authenticated reminder routes with bounded manual intent and safe state", () => {
    const document = generateOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };
    const customer = "/api/v1/vehicle-history/requests/{id}/reminder";
    const operator = "/api/v1/vehicle-history/operator/requests/{id}/reminder";
    expect(Object.entries(document.paths).filter(([path]) => path.includes("/reminder"))
      .flatMap(([path, operations]) => Object.keys(operations).map((method) => `${method} ${path}`)).sort())
      .toEqual([`get ${operator}`, `get ${customer}`, `post ${operator}`, `post ${customer}/stop`].sort());
    for (const [path, method] of [[customer, "get"], [operator, "get"], [operator, "post"], [customer + "/stop", "post"]] as const) {
      expect(document.paths[path]?.[method]).toMatchObject({ security: [{ bearerAuth: [] }] });
    }
    expect(document.paths[operator]?.["post"]).toMatchObject({ requestBody: { content: { "application/json": { schema: {
      type: "object", additionalProperties: false, required: ["expectedWaitingVersion", "expectedAssignmentVersion", "clientMessageId"],
      properties: { expectedWaitingVersion: { minimum: 0, maximum: 2147483647 }, expectedAssignmentVersion: { minimum: 0, maximum: 2147483647 }, clientMessageId: { type: "string", format: "uuid" } },
    } } } }, responses: { "201": { content: { "application/json": { schema: { additionalProperties: false,
      properties: { used: { type: "boolean" }, outcome: { type: "object", nullable: true } },
    } } } } } });
  });
  it("normalizes equivalent UUID attempts and rejects extra purchase or authority input", () => {
    expect(VehicleHistorySchemas.CreateHistoryRequestSchema.parse({
      attemptKey: "12010000-ABCD-4000-8000-000000000001",
    })).toEqual({ attemptKey: "12010000-abcd-4000-8000-000000000001" });
    expect(VehicleHistorySchemas.CreateHistoryRequestSchema.safeParse({
      attemptKey: "12010000-abcd-4000-8000-000000000001", paid: true,
    }).success).toBe(false);
  });

  it("documents authenticated New request, history and reopen boundaries", () => {
    expect(generateOpenApiDocument()).toMatchObject({ paths: {
      "/api/v1/vehicle-history/requests": {
        get: { security: [{ bearerAuth: [] }] },
        post: { security: [{ bearerAuth: [] }], responses: {
          "409": { description: "Attempt key already used with different context" },
        } },
      },
      "/api/v1/vehicle-history/requests/{id}": { get: { security: [{ bearerAuth: [] }] } },
    } });
    expect(VehicleHistorySchemas.HistoryRequestSchema.parse({
      id: "12010000-0000-4000-8000-000000000001", sourceListingId: null,
      createdAt: "2026-11-14T00:00:00.000Z", status: "enquiry", assignedOperator: null,
    }).assignedOperator).toBeNull();
  });
});
