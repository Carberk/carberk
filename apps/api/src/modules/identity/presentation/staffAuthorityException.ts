import { ForbiddenException } from "@nestjs/common";
import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
export function staffAuthorityException(error: unknown): never {
  if (error instanceof StaffAuthorityDenied) throw new ForbiddenException({ code: "FORBIDDEN", message: "Current staff authority required", details: { reason: error.reason } });
  throw error;
}
