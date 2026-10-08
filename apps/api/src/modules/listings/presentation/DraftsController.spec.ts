import { inspect } from "node:util";

import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { ValidateDraftStep } from "../application/ValidateDraftStep";
import type { UpdateDraft } from "../application/UpdateDraft";

import { DraftsController } from "./DraftsController";

function controller(validateStep = vi.fn()) {
  const unused = {} as never;
  return new DraftsController(
    unused,
    unused,
    unused,
    unused,
    { execute: validateStep } as unknown as ValidateDraftStep,
    unused,
  );
}

const req = { user: { sub: "user-1" } } as unknown as FastifyRequest;

describe("DraftsController validate-step", () => {
  it("answers the eight-step wizard's removed vin step as a validation error, not a server error", async () => {
    const validateStep = vi.fn();

    const call = controller(validateStep).validateStep("draft-1", { step: "vin", payload: {} }, req);

    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(call).rejects.toMatchObject({
      response: { code: "VALIDATION_ERROR" },
    });
    expect(validateStep).not.toHaveBeenCalled();
  });

  it("logs only the failing field names, never the request body", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const call = controller().validateStep(
        "draft-1",
        { step: "vin", payload: { note: "sentine1-body-value" } },
        req,
      );

      await expect(call).rejects.toBeInstanceOf(BadRequestException);

      // The exact arguments: an extra argument carrying the body would also fail here.
      expect(errorSpy.mock.calls).toEqual([["[Zod validation failed]", ["step"]]]);
      expect(inspect(errorSpy.mock.calls, { depth: null })).not.toContain("sentine1-body-value");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("DraftsController updateDraft", () => {
  function controllerWithUpdate(updateDraft = vi.fn()) {
    const unused = {} as never;
    return new DraftsController(
      unused,
      { execute: updateDraft } as unknown as UpdateDraft,
      unused,
      unused,
      unused,
      { isSuspended: async () => false } as never,
    );
  }

  it("accepts a null VIN as a clearing update and hands it to the use case", async () => {
    const updateDraft = vi.fn().mockResolvedValue({
      draft: {
        id: "draft-1",
        userId: "user-1",
        payload: {},
        createdAt: new Date("2026-10-09T00:00:00Z"),
        updatedAt: new Date("2026-10-09T00:00:00Z"),
      },
    });

    await controllerWithUpdate(updateDraft).updateDraft("draft-1", { vin: null }, req);

    expect(updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "draft-1", payload: { vin: null } }),
    );
  });
});

describe("DraftsController listMyDrafts", () => {
  function controllerWithList(listMyDrafts = vi.fn()) {
    const unused = {} as never;
    return new DraftsController(
      unused,
      unused,
      unused,
      { execute: listMyDrafts } as never,
      unused,
      unused,
    );
  }

  it("rejects a malformed or forged cursor with a 400 and never calls the use case", async () => {
    const forgedTimestamp = Buffer.from(
      JSON.stringify({
        timestamp: "not-a-date",
        id: "00000000-0000-0000-0000-000000000001",
      }),
      "utf8",
    ).toString("base64url");

    for (const cursor of ["not-a-cursor", forgedTimestamp]) {
      const listMyDrafts = vi.fn();
      const call = controllerWithList(listMyDrafts).listMyDrafts({ cursor }, req);

      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(call).rejects.toMatchObject({
        response: {
          code: "VALIDATION_FAILED",
          details: { reason: "INVALID_CURSOR" },
        },
      });
      expect(listMyDrafts).not.toHaveBeenCalled();
    }
  });
});
