import { describe, expect, it } from "vitest";

import { readVisitorIpPolicy, visitorIp } from "./visitor-ip";

const CLIENT = "203.0.113.7";
const SPOOFED = "198.51.100.1";
const from = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("admin visitor IP", () => {
  it("reads the trusted edge header and ignores another forwarding header", () => {
    const policy = readVisitorIpPolicy({});
    expect(visitorIp(from({ "x-real-ip": CLIENT, "x-forwarded-for": SPOOFED }), policy)).toBe(CLIENT);
    expect(visitorIp(from({ "x-forwarded-for": SPOOFED }), policy)).toBeNull();
  });

  it("rejects malformed or repeated values", () => {
    const policy = readVisitorIpPolicy({});
    for (const value of ["", "not-an-ip", `${CLIENT}, ${SPOOFED}`, `${CLIENT}:443`, "fe80::1%eth0"]) {
      expect(visitorIp(from({ "x-real-ip": value }), policy)).toBeNull();
    }
    expect(visitorIp(from({ "x-real-ip": ` ${CLIENT} ` }), policy)).toBe(CLIENT);
  });

  it("takes the configured trusted hop from X-Forwarded-For", () => {
    const policy = readVisitorIpPolicy({ CLIENT_IP_HEADER: "x-forwarded-for", CLIENT_IP_TRUSTED_HOPS: "2" });
    expect(visitorIp(from({ "x-forwarded-for": `${SPOOFED}, ${CLIENT}, 10.0.0.1` }), policy)).toBe(CLIENT);
    expect(visitorIp(from({ "x-forwarded-for": "10.0.0.1" }), policy)).toBeNull();
  });

  it("trusts no header when its configuration is invalid", () => {
    expect(readVisitorIpPolicy({ CLIENT_IP_HEADER: "x real ip" }).header).toBeNull();
    expect(readVisitorIpPolicy({ API_CLIENT_IP_HEADER: "none" }).header).toBeNull();
  });
});
