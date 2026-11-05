import { beforeAll, afterEach, afterAll } from "vitest";

import { server } from "./msw";

const unhandledRequests: string[] = [];
const recordUnhandledRequest = ({ request }: { request: Request }) => {
  unhandledRequests.push(`${request.method} ${request.url}`);
};

beforeAll(() => {
  server.events.on("request:unhandled", recordUnhandledRequest);
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  const requests = unhandledRequests.splice(0);
  server.resetHandlers();
  if (requests.length > 0) {
    throw new Error(`Unhandled MSW request(s): ${requests.join(", ")}`);
  }
});
afterAll(() => {
  server.events.removeListener("request:unhandled", recordUnhandledRequest);
  server.close();
});
