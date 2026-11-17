import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { AdminCatalogController } from "./AdminCatalogController";

function controllerWithSpy() {
  const useCase = { execute: vi.fn() };
  const controller = new AdminCatalogController(
    useCase as never,
    useCase as never,
    useCase as never,
    useCase as never,
    useCase as never,
    useCase as never,
    useCase as never,
    useCase as never,
    useCase as never,
  );
  return { controller, useCase };
}


const BRAND_ID = "00000000-0000-4000-8000-000000000000";

const req = { user: { sub: "admin-1" } } as unknown as FastifyRequest & { user?: { sub: string } };

const routes = [
  {
    name: "POST /admin/catalog/brands",
    call: (c: AdminCatalogController, body: unknown) => c.createBrand(body, req),
  },
  {
    name: "PATCH /admin/catalog/brands/:id",
    call: (c: AdminCatalogController, body: unknown) => c.updateBrand("brand-1", body, req),
  },
  {
    name: "POST /admin/catalog/brands/:brandId/models",
    call: (c: AdminCatalogController, body: unknown) => c.createModel(BRAND_ID, body, req),
  },
  {
    name: "PATCH /admin/catalog/models/:id",
    call: (c: AdminCatalogController, body: unknown) => c.updateModel("model-1", body, req),
  },
];

describe("AdminCatalogController malformed bodies (#680)", () => {
  it.each(routes)(
    "$name answers 400 VALIDATION_FAILED, not 500, and never calls the use case",
    async ({ call }) => {
      const { controller, useCase } = controllerWithSpy();

      const error = await Promise.resolve()
        .then(() => call(controller, { nameRu: 42 }))
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "VALIDATION_FAILED",
      });
      expect(useCase.execute).not.toHaveBeenCalled();
    },
  );
});
