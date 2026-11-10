import { ListingVideoTelemetrySchemas } from "@auto-tm/contracts";

import { apiClient } from "../../api/client";

export type ListingVideoTelemetryEvent = ListingVideoTelemetrySchemas.ListingVideoTelemetryEvent;
/** Reports one tester measurement (#1052); never throws, never waits. */
export type ListingVideoTelemetry = (event: ListingVideoTelemetryEvent) => void;

/**
 * Sends a measurement to the API, which logs it only for video testers.
 * The event is checked against the shared contract first, so a field that
 * could carry a URL, grant, path or ID is dropped on the phone rather than
 * refused by the server. Measurement never affects upload or playback.
 */
export const sendListingVideoTelemetry: ListingVideoTelemetry = (event) => {
  const parsed = ListingVideoTelemetrySchemas.ListingVideoTelemetryEventSchema.safeParse(event);
  if (!parsed.success) return;
  void apiClient.post("/listings/video-telemetry", parsed.data).catch(() => undefined);
};
