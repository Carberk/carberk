import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { generateOpenApiDocument } from "./openapi";

it("keeps committed OpenAPI synchronized with the contract schemas", () => {
  const committed: unknown = JSON.parse(readFileSync("openapi.json", "utf8"));
  const generated: unknown = JSON.parse(JSON.stringify(generateOpenApiDocument()));

  expect(generated).toStrictEqual(committed);
});
