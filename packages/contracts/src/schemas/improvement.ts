import { z } from "zod";

export const ImprovementPeriodSchema=z.enum(["completed_week","previous_week","today"]);
export type ImprovementPeriod=z.infer<typeof ImprovementPeriodSchema>;
export const ImprovementRateSchema=z.object({
 state:z.enum(["ready","empty","immature","delayed","suppressed"]),numerator:z.number().nonnegative().nullable(),denominator:z.number().nonnegative().nullable(),
 value:z.number().nonnegative().nullable(),smallSample:z.boolean(),
}).strict();
export type ImprovementRate=z.infer<typeof ImprovementRateSchema>;
export const ImprovementScorecardSchema=z.object({
 version:z.literal(1),state:z.enum(["ready","empty","delayed"]),
 disclosure:z.object({policy:z.literal("fixed-week-v1"),suppressedMetrics:z.array(z.string()).max(30)}).strict().optional(),
 inventory:z.object({listingHours:z.number().nonnegative().nullable(),averageActive:z.number().nonnegative().nullable(),currentActive:z.number().int().nonnegative().nullable()}).strict(),
 contacts:z.object({calls:z.number().int().nonnegative().nullable(),conversations:z.number().int().nonnegative().nullable(),total:z.number().int().nonnegative().nullable(),perActiveListing:z.number().nonnegative().nullable()}).strict(),
 publication:ImprovementRateSchema,replies:ImprovementRateSchema,signIn:ImprovementRateSchema,upload:ImprovementRateSchema,
 firstBuyerMessages:z.number().int().nonnegative().nullable(),
 steps:z.array(z.object({step:z.enum(["vehicle","specs","photos","price","location","contact","review"]),opened:z.number().int().nonnegative().nullable(),completed:z.number().int().nonnegative().nullable()}).strict()).length(7),
 discovery:z.object({opens:z.number().int().nonnegative().nullable(),searches:z.number().int().nonnegative().nullable(),detailOpens:z.number().int().nonnegative().nullable()}).strict(),
 zeroSearches:ImprovementRateSchema,
 retention:z.object({accounts:z.object({d1:ImprovementRateSchema,d7:ImprovementRateSchema,d30:ImprovementRateSchema}).strict(),guests:z.object({d1:ImprovementRateSchema,d7:ImprovementRateSchema,d30:ImprovementRateSchema}).strict()}).strict(),
}).strict();
export type ImprovementScorecard=z.infer<typeof ImprovementScorecardSchema>;
export const ImprovementSnapshotSchema=z.object({
 state:z.enum(["ready","empty","delayed","unavailable","suppressed"]),period:ImprovementPeriodSchema,
 windowFrom:z.string().datetime(),windowTo:z.string().datetime(),generatedAt:z.string().datetime().nullable(),completeThrough:z.string().datetime().nullable(),
 environment:z.enum(["test","staging","production"]),population:z.enum(["synthetic","reviewer","pilot","marketplace"]),
 version:z.number().int().positive(),lateRecords:z.number().int().nonnegative().nullable(),inventoryAvailable:z.boolean(),
 scorecard:ImprovementScorecardSchema.nullable(),
}).strict();
export type ImprovementSnapshot=z.infer<typeof ImprovementSnapshotSchema>;
export const ImprovementInvestigationRequestSchema=z.object({period:ImprovementPeriodSchema,reason:z.string().trim().min(8).max(500)}).strict();
export const ImprovementArtifactReceiptSchema=z.object({id:z.string().uuid(),expiresAt:z.string().datetime()}).strict();
// Redacted event facts deliberately have no payload, account ID, visit ID, Message, media or provider data.
export const ImprovementTimelineSchema=z.object({
 generatedAt:z.string().datetime(),expiresAt:z.string().datetime(),reason:z.string().min(8),
 events:z.array(z.object({at:z.string().datetime(),subject:z.string().regex(/^person_[1-9][0-9]{0,2}$/),eventName:z.string().regex(/^[a-z_]{1,64}$/),platform:z.enum(["android","ios","web","admin","server"]),release:z.string().max(64),result:z.enum(["success","expected_rejection","technical_failure","cancelled"]).optional()}).strict()).max(100),
}).strict();
export type ImprovementTimeline=z.infer<typeof ImprovementTimelineSchema>;

export const AnonymousMarketCellSchema=z.object({
 market:z.literal("TM"),period:z.string().regex(/^20[0-9]{2}-(0[1-9]|1[0-2])$/),vehicleClass:z.enum(["passenger","commercial","other"]),observations:z.number().int().min(5),
 priceBand:z.enum(["under_5000","5000_14999","15000_29999","30000_plus","unknown"]),ageBand:z.enum(["18_24","25_34","35_44","45_54","55_plus","unknown"]).default("unknown"),
 residence:z.enum(["TM-A","TM-B","TM-D","TM-L","TM-M","TM-S","unknown"]).default("unknown"),demographicSource:z.enum(["self_reported_synthetic","unknown"]).default("unknown"),
}).strict();
export const MarketKnowledgeViewSchema=z.union([
 z.object({state:z.literal("qualified"),commercialDisclosure:z.literal(false),retention:z.literal("qualified_source_policy"),dataset:z.object({id:z.string(),version:z.number().int(),derivationVersion:z.string(),retentionClass:z.enum(["qualified_indefinite","qualified_expiring"]),expiresAt:z.string().datetime().nullable(),sources:z.array(z.object({id:z.string(),version:z.number().int().positive(),provenance:z.string(),retentionBasis:z.string()}).strict()).min(1).max(20),cells:z.array(AnonymousMarketCellSchema).max(1000)}).strict()}).strict(),
 z.object({state:z.enum(["quarantined","invalidated","unavailable"]),reason:z.string().optional()}).strict(),
]);
export type MarketKnowledgeView=z.infer<typeof MarketKnowledgeViewSchema>;

/** Fixed disjoint UTC calendar weeks. Today has no aggregate release. */
export function improvementWindow(period:ImprovementPeriod,now:Date):{from:Date;to:Date} {
 const day=86400000,midnight=Math.floor(now.getTime()/day)*day,monday=midnight-((now.getUTCDay()+6)%7)*day;
 return {from:new Date(period==="today"?midnight:monday-(period==="previous_week"?14:7)*day),to:new Date(period==="today"?now.getTime():period==="previous_week"?monday-7*day:monday)};
}
