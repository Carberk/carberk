import type { ListingVideoTelemetrySchemas } from "@auto-tm/contracts";

/** Where validated tester video measurements go (#1052). */
export interface ListingVideoTelemetryPort {
  record(event: ListingVideoTelemetrySchemas.ListingVideoTelemetryEvent): void;
}

export const LISTING_VIDEO_TELEMETRY_PORT = Symbol("ListingVideoTelemetryPort");
