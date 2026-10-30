import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { httpProbe } from "./httpProbe";

describe("real HTTP watchdog boundary", () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/ready") response.end(JSON.stringify({ status: "ready" }));
    else if (request.url === "/maintenance") response.end(JSON.stringify({ status: "maintenance", businessReady: false }));
    else if (request.url === "/large") response.end(JSON.stringify({ status: "ready", ignored: "x".repeat(5000) }));
    else if (request.url === "/redirect") { response.writeHead(302, { location: "/ready" }); response.end(); }
    else { response.writeHead(503); response.end("{}"); }
  });
  let base: string;
  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP test listener");
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  it("accepts actual readiness and denies maintenance, dependency failure, redirects and oversized responses", async () => {
    expect(await httpProbe(`${base}/ready`, "api")).toBe("healthy");
    for (const path of ["maintenance", "failure", "redirect", "large"]) expect(await httpProbe(`${base}/${path}`, "api")).toBe("failing");
    expect(await httpProbe(undefined, "collector")).toBe("unknown");
  });
});
