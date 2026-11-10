import { Injectable, Logger } from "@nestjs/common";
import type { ListingVideoTelemetrySchemas } from "@auto-tm/contracts";

import type { ListingVideoTelemetryPort } from "../domain/ports/ListingVideoTelemetryPort";

/**
 * One structured log line per event, searchable in Railway logs as
 * `listing_video.<event>`. The contract already limits it to numbers and
 * fixed reasons; no User, request or device detail is added here.
 */
@Injectable()
export class LogListingVideoTelemetry implements ListingVideoTelemetryPort {
  private readonly logger = new Logger("ListingVideoTelemetry");
  record({ event, ...fields }: ListingVideoTelemetrySchemas.ListingVideoTelemetryEvent): void {
    this.logger.log({ event: `listing_video.${event}`, ...fields });
  }
}
