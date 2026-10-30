import { describe, expect, it } from "vitest";

import { TechnicalCounters } from "./TechnicalCounters";

describe("bounded non-identifying technical metrics", () => {
  it("requires a complete measured window and denominator, excludes business rejection from errors", () => {
    let now = Date.parse("2026-10-18T00:00:00Z");
    const counters = new TechnicalCounters(() => now);
    for (let index = 0; index < 94; index++) counters.record(400, 100);
    for (let index = 0; index < 6; index++) counters.record(500, 100);
    now += 299_999;
    expect(counters.snapshot().errors.rate).toBeNull();
    now++;
    expect(counters.snapshot().errors).toEqual({ windowMs: 300_000, requests: 100, technicalErrors: 6, rate: .06 });
  });
  it("does not present a sparse failure or startup latency as a known rate", () => {
    let now = 0;
    const counters = new TechnicalCounters(() => now);
    counters.record(500, 3000); now += 300_000;
    expect(counters.snapshot().errors.rate).toBeNull();
    expect(counters.snapshot().latency.p95UpperMs).toBeNull();
  });
  it("calculates bounded ten-minute p95 and forgets old requests", () => {
    let now = 0;
    const counters = new TechnicalCounters(() => now);
    for (let index = 0; index < 94; index++) counters.record(200, 100);
    for (let index = 0; index < 6; index++) counters.record(200, 2001);
    now = 600_000;
    expect(counters.snapshot().latency).toEqual({ windowMs: 600_000, requests: 100, p95UpperMs: 5000 });
    now += 10_000;
    expect(counters.snapshot().latency).toEqual({ windowMs: 600_000, requests: 0, p95UpperMs: null });
  });
});
