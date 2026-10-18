import { z } from "zod";

export const ImprovementPeriodSchema=z.enum(["completed_week","previous_week","today"]);
export type ImprovementPeriod=z.infer<typeof ImprovementPeriodSchema>;
export const ImprovementRateSchema=z.object({
 state:z.enum(["ready","empty","immature","delayed"]),numerator:z.number().nonnegative().nullable(),denominator:z.number().nonnegative().nullable(),
 value:z.number().nonnegative().nullable(),smallSample:z.boolean(),
}).strict();
export const ImprovementScorecardSchema=z.object({
 version:z.literal(1),state:z.enum(["ready","empty","delayed"]),
 inventory:z.object({listingHours:z.number().nonnegative().nullable(),averageActive:z.number().nonnegative().nullable(),currentActive:z.number().int().nonnegative().nullable()}).strict(),
 contacts:z.object({calls:z.number().int().nonnegative(),conversations:z.number().int().nonnegative(),total:z.number().int().nonnegative(),perActiveListing:z.number().nonnegative().nullable()}).strict(),
 publication:ImprovementRateSchema,replies:ImprovementRateSchema,signIn:ImprovementRateSchema,upload:ImprovementRateSchema,
 firstBuyerMessages:z.number().int().nonnegative(),
 steps:z.array(z.object({step:z.enum(["vehicle","specs","photos","price","location","contact","review"]),opened:z.number().int().nonnegative(),completed:z.number().int().nonnegative()}).strict()).length(7),
 discovery:z.object({opens:z.number().int().nonnegative(),searches:z.number().int().nonnegative(),detailOpens:z.number().int().nonnegative()}).strict(),
 zeroSearches:ImprovementRateSchema,
 retention:z.object({accounts:z.object({d1:ImprovementRateSchema,d7:ImprovementRateSchema,d30:ImprovementRateSchema}).strict(),guests:z.object({d1:ImprovementRateSchema,d7:ImprovementRateSchema,d30:ImprovementRateSchema}).strict()}).strict(),
}).strict();
export type ImprovementScorecard=z.infer<typeof ImprovementScorecardSchema>;
export const ImprovementSnapshotSchema=z.object({
 state:z.enum(["ready","empty","delayed","unavailable","suppressed"]),period:ImprovementPeriodSchema,
 windowFrom:z.string().datetime(),windowTo:z.string().datetime(),generatedAt:z.string().datetime().nullable(),completeThrough:z.string().datetime().nullable(),
 environment:z.enum(["test","staging","production"]),population:z.enum(["synthetic","reviewer","pilot","marketplace"]),
 version:z.number().int().positive(),lateRecords:z.number().int().nonnegative(),inventoryAvailable:z.boolean(),
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
