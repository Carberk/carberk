import { describe, expect, it } from "vitest";

import { deriveSyntheticMarketCells, qualifyAnonymousDataset, type KnowledgeSource, type AnonymousDataset } from "./AnonymousMarketKnowledge";

const source: KnowledgeSource = {
 id: "synthetic-market", version: 1, epoch: "current", status: "permitted", provenance: "generated independent synthetic fixtures",
 purpose: "synthetic_research", reuse: "permitted", redistribution: "unresolved", retentionBasis: "independent synthetic observations",
 expiresAt: null, deletedAt: null, review: { singlingOut: "passed", linkage: "passed", rareVehicles: "passed", combinations: "passed", repeatedQueries: "passed" },
 restrictions:{syntheticOnly:true,retention:"indefinite",deletion:"invalidate_derivatives",export:"internal_synthetic_only",demographics:"synthetic_self_reported"},
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
 it("fails closed on unresolved retention, deletion, export and demographic restrictions",()=>{
  for(const restrictions of [null,{}, {...source.restrictions,retention:"unresolved"},{...source.restrictions,deletion:"ignore"},{...source.restrictions,export:"public"},{...source.restrictions,retention:"until_source_expiry"}]) {
   expect(qualifyAnonymousDataset(dataset,[{...source,restrictions} as KnowledgeSource],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"rights"});
  }
  const demographic={...dataset,cells:[{...dataset.cells[0],ageBand:"25_34",demographicSource:"self_reported_synthetic"}]};
  expect(qualifyAnonymousDataset(demographic,[{...source,restrictions:{...source.restrictions,demographics:"prohibited"}} as KnowledgeSource],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"rights"});
 });
 it("refuses rare groups, linkage gaps, arbitrary extra identifiers and live demographics", () => {
  expect(qualifyAnonymousDataset({...dataset,cells:[{...dataset.cells[0],observations:4}]},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"anonymity"});
  expect(qualifyAnonymousDataset({...dataset,review:{...dataset.review,linkage:"unresolved"}},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"anonymity"});
  expect(qualifyAnonymousDataset({...dataset,cells:[{...dataset.cells[0],hashedVin:"secret"}]},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"schema"});
  expect(qualifyAnonymousDataset({...dataset,synthetic:false},[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"live_collection"});
 });
});

describe("fixed synthetic monthly releases",()=>{
 it("suppresses small cells and releases coarsened counts without identifiers or totals",()=>{
  expect(deriveSyntheticMarketCells([{...dataset.cells[0],observations:9},{...dataset.cells[0],vehicleClass:"commercial",observations:17}])).toEqual({state:"ready",period:"2026-10",suppressedCells:1,cells:[{market:"TM",period:"2026-10",vehicleClass:"commercial",observations:15,priceBand:"15000_29999",ageBand:"unknown",residence:"unknown",demographicSource:"unknown"}]});
 });
 it("refuses overlapping duplicate cells, extra identifiers and mixed monthly releases",()=>{
  expect(deriveSyntheticMarketCells([dataset.cells[0],dataset.cells[0]])).toEqual({state:"quarantined"});
  expect(deriveSyntheticMarketCells([{...dataset.cells[0],hashedVin:"forbidden"}])).toEqual({state:"quarantined"});
  expect(deriveSyntheticMarketCells([dataset.cells[0],{...dataset.cells[0],period:"2026-11"}])).toEqual({state:"quarantined"});
 });
});

it("requires a separate documented synthetic demographic purpose, basis, notice and personal lifecycle",()=>{
 const demographic={...dataset,cells:[{...dataset.cells[0],ageBand:"25_34",demographicSource:"self_reported_synthetic"}]};
 expect(qualifyAnonymousDataset(demographic,[source],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"rights"});
 const policy={purpose:"synthetic_demographic_research",basis:"synthetic_fixture",notice:"synthetic_fixture_documented",personalLifecycle:"no_personal_records"};
 expect(qualifyAnonymousDataset(demographic,[{...source,restrictions:{...source.restrictions,demographicPolicy:policy}}],{epoch:"current",now})).toMatchObject({state:"qualified"});
 for(const field of Object.keys(policy)){
  const incomplete=Object.fromEntries(Object.entries(policy).filter(([key])=>key!==field));
  expect(qualifyAnonymousDataset(demographic,[{...source,restrictions:{...source.restrictions,demographicPolicy:incomplete}}],{epoch:"current",now})).toMatchObject({state:"quarantined",reason:"rights"});
 }
});
