import { http, HttpResponse } from "msw";
import { setupServer } from "msw/native";

/**
 * Listing video telemetry bodies the app sent in the current test, as the
 * fake server received them. Cleared after every test.
 */
export const sentVideoTelemetry: unknown[] = [];

export const server = setupServer(
  // Video screens report measurements fire-and-forget; every test gets a
  // fake endpoint so they never reach the unhandled-request guard.
  http.post("*/listings/video-telemetry", async ({ request }) => {
    sentVideoTelemetry.push(await request.json());
    return new HttpResponse(null, { status: 204 });
  }),
);
