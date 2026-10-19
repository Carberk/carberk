import { BadRequestException } from "@nestjs/common";
import { z, type ZodError } from "zod";

import { CursorPaginationRequestSchema, ErrorCode } from "@auto-tm/contracts";

// Matches what the catalog encoders write: the localized name and id of the
// last row of the previous page as base64-encoded JSON (see
// presentation/catalog.controller.ts and the Prisma list repositories).
const CatalogCursorSchema = z.object({ name: z.string(), id: z.string() });

export interface CatalogPagination {
  cursor?: { name: string; id: string };
  limit: number;
}

/**
 * Parses cursor pagination for the catalog list endpoints. A malformed or
 * forged cursor and an invalid limit are client errors, never a 500: this
 * helper translates them into a 400 `VALIDATION_FAILED`.
 */
export function parseCatalogPagination(query: unknown): CatalogPagination {
  let request: { cursor?: string; limit: number };
  try {
    request = CursorPaginationRequestSchema.parse(query);
  } catch (err) {
    // Duck-typed: the schema's ZodError can come from another copy of zod,
    // which fails `instanceof` and would turn a bad request into a 500.
    if (err && typeof err === "object" && "issues" in err) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: "Invalid request",
        details: (err as ZodError).flatten(),
      });
    }
    throw err;
  }

  if (request.cursor === undefined) {
    return { limit: request.limit };
  }

  try {
    const cursor = CatalogCursorSchema.parse(
      JSON.parse(Buffer.from(request.cursor, "base64").toString("utf-8")),
    );
    return { cursor, limit: request.limit };
  } catch {
    throw new BadRequestException({
      code: ErrorCode.ValidationFailed,
      message: "Invalid cursor",
      details: { reason: "INVALID_CURSOR" },
    });
  }
}
