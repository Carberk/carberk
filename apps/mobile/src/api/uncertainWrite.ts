import { ApiError } from "./client";

export function isUncertainWrite(error: unknown): boolean {
  if (error instanceof ApiError && ["ROUTE_UNAVAILABLE", "REFRESH_UNAVAILABLE"].includes(error.code)) return false;
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}
