import { Injectable, Logger } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import type { ListingVideoTelemetrySchemas } from "@auto-tm/contracts";

import type { ListingVideoTelemetryPort } from "../domain/ports/ListingVideoTelemetryPort";

/**
 * One structured log line per event, searchable in Railway logs as
 * `listing_video.<event>`. The contract already limits it to numbers and
 * fixed reasons. It is written through the root logger: the request-bound
 * logger would attach the tester's headers and address to the line.
 */
@Injectable()
export class LogListingVideoTelemetry implements ListingVideoTelemetryPort {
  private readonly fallback = new Logger("ListingVideoTelemetry");
  record({ event, ...fields }: ListingVideoTelemetrySchemas.ListingVideoTelemetryEvent): void {
    const line = { context: "ListingVideoTelemetry", event: `listing_video.${event}`, ...fields };
    // Without LoggerModule (unit tests) there is no root logger and no request binding.
    if (PinoLogger.root) PinoLogger.root.info(line);
    else this.fallback.log(line);
  }
}
