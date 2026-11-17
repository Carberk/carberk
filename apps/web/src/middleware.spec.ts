import { describe, expect, it } from "vitest";

import { config } from "./middleware";

function matcherMatches(pathname: string): boolean {


  return config.matcher.some((pattern) =>
    new RegExp(`^${pattern}$`).test(pathname),
  );
}

describe("web middleware matcher", () => {
  it("does not intercept /healthz (deploy health must bypass locale routing)", () => {
    expect(matcherMatches("/healthz")).toBe(false);
  });

  it("still routes locale-less pages through the middleware", () => {
    expect(matcherMatches("/listings/abc")).toBe(true);
    expect(matcherMatches("/")).toBe(true);
  });

  it("still skips Next internals, api routes, and static files", () => {
    expect(matcherMatches("/_next/static/chunk.js")).toBe(false);
    expect(matcherMatches("/api/og")).toBe(false);
    expect(matcherMatches("/favicon.ico")).toBe(false);
  });
});
