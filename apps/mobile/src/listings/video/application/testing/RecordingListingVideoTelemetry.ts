import type { ListingVideoTelemetry, ListingVideoTelemetryEvent } from "../../listingVideoTelemetry";

/** Collects the measurements a video module reported, in order. */
export class RecordingListingVideoTelemetry {
  readonly events: ListingVideoTelemetryEvent[] = [];
  readonly report: ListingVideoTelemetry = (event) => { this.events.push(event); };
}
