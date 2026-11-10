import type { ListingVideoTelemetrySchemas } from "@auto-tm/contracts";

import type { ListingVideoTelemetryPort } from "../../domain/ports/ListingVideoTelemetryPort";

export class RecordingListingVideoTelemetry implements ListingVideoTelemetryPort {
  readonly events: ListingVideoTelemetrySchemas.ListingVideoTelemetryEvent[] = [];
  record(event: ListingVideoTelemetrySchemas.ListingVideoTelemetryEvent): void {
    this.events.push(event);
  }
}
