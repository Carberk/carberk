import { ImprovementSchemas } from "@auto-tm/contracts";
import { z } from "zod";

export interface KnowledgeSource {
 id:string; version:number; epoch:string; status:string; provenance:string; purpose:string; reuse:string; redistribution:string;
 restrictions:Record<string,unknown>;
 retentionBasis:string; expiresAt:Date|null; deletedAt:Date|null; review:Record<string,string>; destinations:string[];
}
export interface AnonymousDataset {
 id:string; version:number; epoch:string; derivationVersion:string; destination:string; sourceFences:{id:string;version:number;epoch:string}[];
 synthetic:boolean; review:Record<string,string>; cells:Record<string,unknown>[];
}

export const KnowledgeSourceRestrictionsSchema=z.object({
 syntheticOnly:z.literal(true),retention:z.enum(["indefinite","until_source_expiry"]),
 deletion:z.literal("invalidate_derivatives"),export:z.literal("internal_synthetic_only"),
 demographics:z.enum(["synthetic_self_reported","prohibited"]),
 demographicPolicy:z.object({purpose:z.literal("synthetic_demographic_research"),basis:z.literal("synthetic_fixture"),notice:z.literal("synthetic_fixture_documented"),personalLifecycle:z.literal("no_personal_records")}).strict().optional(),
}).strict();
const cellSchema=ImprovementSchemas.AnonymousMarketCellSchema;
const reviews = ["singlingOut","linkage","rareVehicles","combinations","repeatedQueries"] as const;
type Qualification = {state:"qualified";commercialDisclosure:false;retention:"qualified_source_policy"}
 | {state:"invalidated"|"quarantined";reason:"epoch"|"schema"|"destination"|"live_collection"|"source"|"rights"|"anonymity"};
/** Qualification is deliberately restricted to synthetic research. No path here activates live collection or disclosure. */
export function qualifyAnonymousDataset(dataset:AnonymousDataset,sources:readonly KnowledgeSource[],context:{epoch:string;now:Date}):Qualification {
 if(dataset.epoch!==context.epoch || !context.epoch) return {state:"invalidated",reason:"epoch"};
 if(dataset.destination!=="internal_synthetic_research") return {state:"quarantined",reason:"destination"};
 if(!dataset.synthetic) return {state:"quarantined",reason:"live_collection"};
 if(!dataset.id || !Number.isSafeInteger(dataset.version) || dataset.version<1 || !dataset.derivationVersion || dataset.sourceFences.length===0) return {state:"quarantined",reason:"schema"};
 if(reviews.some(key=>dataset.review[key]!=="passed")) return {state:"quarantined",reason:"anonymity"};
 if(new Set(dataset.sourceFences.map(fence=>fence.id)).size!==dataset.sourceFences.length) return {state:"quarantined",reason:"source"};
 for(const fence of dataset.sourceFences) {
  const source=sources.find(item=>item.id===fence.id);
  if(!source || source.version!==fence.version || source.epoch!==fence.epoch || source.epoch!==context.epoch || source.status!=="permitted" || source.deletedAt || (source.expiresAt && source.expiresAt<=context.now)) return {state:"invalidated",reason:"source"};
  if(!source.provenance.trim() || !source.retentionBasis.trim() || source.purpose!=="synthetic_research" || source.reuse!=="permitted" || !source.destinations.includes(dataset.destination)) return {state:"quarantined",reason:"rights"};
  const restrictions=KnowledgeSourceRestrictionsSchema.safeParse(source.restrictions);
  if(!restrictions.success || (restrictions.data.retention==="until_source_expiry" && !source.expiresAt)) return {state:"quarantined",reason:"rights"};
  const knownDemographics=dataset.cells.some(cell=>(cell["ageBand"]??"unknown")!=="unknown" || (cell["residence"]??"unknown")!=="unknown");
  if(knownDemographics && !restrictions.data.demographicPolicy)return {state:"quarantined",reason:"rights"};
  if(restrictions.data.demographics==="prohibited" && dataset.cells.some(cell=>(cell["ageBand"]??"unknown")!=="unknown" || (cell["residence"]??"unknown")!=="unknown")) return {state:"quarantined",reason:"rights"};
  if(reviews.some(key=>source.review[key]!=="passed")) return {state:"quarantined",reason:"anonymity"};
 }
 const parsed=z.array(cellSchema).min(1).max(1000).safeParse(dataset.cells);
 if(!parsed.success) return {state:"quarantined",reason:dataset.cells.some(cell=>typeof cell["observations"]==="number" && cell["observations"]<5)?"anonymity":"schema"};
 const keys=new Set<string>();
 for(const cell of parsed.data) {
  // Fixed disjoint cells only. This reader exposes no arbitrary filters, totals or overlapping recombinations.
  const key=JSON.stringify([cell.market,cell.period,cell.vehicleClass,cell.priceBand,cell.ageBand,cell.residence]);
  if(keys.has(key) || cell.observations<5 || ((cell.ageBand!=="unknown" || cell.residence!=="unknown") && cell.demographicSource!=="self_reported_synthetic")) return {state:"quarantined",reason:"anonymity"};
  keys.add(key);
 }
 return {state:"qualified",commercialDisclosure:false,retention:"qualified_source_policy"};
}

/** One fixed monthly partition. No totals, arbitrary filters or exact small counts are released. */
export function deriveSyntheticMarketCells(input:unknown) {
 const parsed=z.array(cellSchema.extend({observations:z.number().int().nonnegative().max(1_000_000)})).min(1).max(1000).safeParse(input);
 if(!parsed.success) return {state:"quarantined" as const};
 const keys=new Set<string>(),period=parsed.data[0]?.period;
 if(!period)return {state:"quarantined" as const};
 for(const cell of parsed.data) {
  const key=JSON.stringify([cell.market,cell.period,cell.vehicleClass,cell.priceBand,cell.ageBand,cell.residence]);
  if(cell.period!==period || keys.has(key) || ((cell.ageBand!=="unknown" || cell.residence!=="unknown") && cell.demographicSource!=="self_reported_synthetic")) return {state:"quarantined" as const};
  keys.add(key);
 }
 const cells=parsed.data.filter(cell=>cell.observations>=10).map(cell=>({...cell,observations:Math.floor(cell.observations/5)*5})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {state:"ready" as const,period,suppressedCells:parsed.data.length-cells.length,cells};
}
