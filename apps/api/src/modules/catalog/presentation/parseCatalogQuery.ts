import { BadRequestException } from "@nestjs/common";
import type { ZodError } from "zod";

import { ErrorCode } from "@auto-tm/contracts";






export function parseCatalogQuery<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (err) {


    if (err && typeof err === "object" && "issues" in err) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: "Invalid request",
        details: (err as ZodError).flatten(),
      });
    }
    throw err;
  }
}
