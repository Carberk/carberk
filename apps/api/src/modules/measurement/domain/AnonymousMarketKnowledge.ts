import { ImprovementSchemas } from "@auto-tm/contracts";
import { z } from "zod";

export interface KnowledgeSource {
 id:string; version:number; epoch:string; status:string; provenance:string; purpose:string; reuse:string; redistribution:string;
 retentionBasis:string; expiresAt:Date|null; deletedAt:Date|null; review:Record<string,string>; destinations:string[];
}
export interface AnonymousDataset {
 id:string; version:number; epoch:string; derivationVersion:string; destination:string; sourceFences:{id:string;version:number;epoch:string}[];
 synthetic:boolean; review:Record<string,string>; cells:Record<string,unknown>[];
}

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
