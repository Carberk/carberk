import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { CursorPaginationRequestSchema, ErrorCode } from "@auto-tm/contracts";

import { parseCatalogQuery } from "./parseCatalogQuery";





const CatalogCursorSchema = z.object({
  name: z.string(),
  id: z.string().min(1),
});

export type CatalogCursor = z.infer<typeof CatalogCursorSchema>;

export interface CatalogPagination {
  cursor?: CatalogCursor;
  limit: number;
}






export function parseCatalogPagination(query: unknown): CatalogPagination {
  const request = parseCatalogQuery(CursorPaginationRequestSchema, query);

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

export function encodeCatalogCursor(cursor: CatalogCursor | undefined): string | null {
  return cursor
    ? Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64")
    : null;
}
