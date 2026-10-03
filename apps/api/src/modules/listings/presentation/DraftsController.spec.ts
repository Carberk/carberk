import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { ValidateDraftStep } from "../application/ValidateDraftStep";

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
});
