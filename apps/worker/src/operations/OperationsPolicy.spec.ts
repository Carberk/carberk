import { describe, expect, it } from "vitest";

import { advanceIncident, budgetProjection, inStaffedCoverage, staffedDeadline, technicalRate } from "./OperationsPolicy";

describe("operational decisions from measured evidence",()=>{
 it("keeps low-volume errors unknown while an independently confirmed outage still opens an incident",()=>{
  expect(technicalRate({requests:2,technicalErrors:1,windowMs:300000})).toBeNull();
  const incident=advanceIncident(null,true,new Date("2026-10-17T12:00:00Z"));expect(incident?.openedAt).toBe("2026-10-17T12:00:00.000Z");
  expect(advanceIncident(incident,true,new Date("2026-10-19T00:00:00Z"))?.openedAt).toBe(incident?.openedAt);
 });
 it("uses a complete five-minute denominator and technical errors only",()=>{
  expect(technicalRate({requests:100,technicalErrors:6,windowMs:299999})).toBeNull();
  expect(technicalRate({requests:100,technicalErrors:6,windowMs:300000})).toBe(.06);
 });
 it("warns at eighty percent of the phase ceiling without authorizing shutdown or spending",()=>{
  expect(budgetProjection("railway",80)).toEqual({currency:"USD",ceiling:100,projected:80,warning:true});
  expect(budgetProjection("tm",6399).warning).toBe(false);expect(budgetProjection("tm",6400).warning).toBe(true);
 });
 it("preserves the sole responder schedule and measures four staffed hours across a weekend",()=>{
  expect(inStaffedCoverage(new Date("2026-10-16T11:59:00Z"))).toBe(true);
  expect(inStaffedCoverage(new Date("2026-10-16T12:00:00Z"))).toBe(false);
  expect(staffedDeadline(new Date("2026-10-16T11:00:00Z"),4)).toEqual(new Date("2026-10-19T03:00:00Z"));
 });
});
