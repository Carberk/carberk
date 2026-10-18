import { describe, expect, it } from "vitest";

import { qualifyAnonymousDataset, type KnowledgeSource, type AnonymousDataset } from "./AnonymousMarketKnowledge";

const source: KnowledgeSource = {
 id: "synthetic-market", version: 1, epoch: "current", status: "permitted", provenance: "generated independent synthetic fixtures",
 purpose: "synthetic_research", reuse: "permitted", redistribution: "unresolved", retentionBasis: "independent synthetic observations",
 expiresAt: null, deletedAt: null, review: { singlingOut: "passed", linkage: "passed", rareVehicles: "passed", combinations: "passed", repeatedQueries: "passed" },
 destinations: ["internal_synthetic_research"],
};
const dataset: AnonymousDataset = {
 id: "market-2026-10", version: 1, epoch: "current", derivationVersion: "tm-market-v1", destination: "internal_synthetic_research",
 sourceFences: [{ id: source.id, version: 1, epoch: "current" }], synthetic: true,
 review: source.review, cells: [{ market: "TM", period: "2026-10", vehicleClass: "passenger", observations: 30, priceBand: "15000_29999", ageBand: "unknown", residence: "unknown" }],
};
const now = new Date("2026-10-17T00:00:00Z");
describe("rights-qualified synthetic anonymous market knowledge", () => {
 it("admits fixed anonymous research while unresolved redistribution never grants commercial export", () => {
  expect(qualifyAnonymousDataset(dataset, [source], { epoch:"current", now })).toEqual({ state:"qualified", commercialDisclosure:false, retention:"qualified_source_policy" });
  expect(qualifyAnonymousDataset({...dataset,destination:"commercial"}, [source], {epoch:"current",now})).toMatchObject({state:"quarantined",reason:"destination"});
 });
 it("quarantines missing provenance or reuse and invalidates current-source revocation, expiry, deletion and restore", () => {
  for(const replacement of [{provenance:""},{reuse:"unresolved"},{status:"revoked"},{deletedAt:now},{expiresAt:now},{version:2},{epoch:"restored"}]) {
   expect(qualifyAnonymousDataset(dataset,[{...source,...replacement} as KnowledgeSource],{epoch:"current",now}).state).not.toBe("qualified");
  }
  expect(qualifyAnonymousDataset(dataset,[source],{epoch:"restored",now})).toMatchObject({state:"invalidated",reason:"epoch"});
 });
 it("refuses rare groups, linkage gaps, arbitrary extra identifiers and live demographics", () => {
  expect(qualifyAnonymousDataset({...dataset,cells:[{...dataset.cells[0],observations:4}]},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"anonymity"});
  expect(qualifyAnonymousDataset({...dataset,review:{...dataset.review,linkage:"unresolved"}},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"anonymity"});
  expect(qualifyAnonymousDataset({...dataset,cells:[{...dataset.cells[0],hashedVin:"secret"}]},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"schema"});
  expect(qualifyAnonymousDataset({...dataset,synthetic:false},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"live_collection"});
 });
});
