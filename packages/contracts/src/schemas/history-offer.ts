import { DateTimeSchema, z } from "../zod";

const Version = z.number().int().min(0).max(2147483647);
const VinInput = z.string().min(1).max(80);
export const HistoryDeliveryFormatSchema = z.enum(["pdf", "link", "both"]);
export const HistoryPreflightSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["malformed", "unsupported", "no_history", "mismatch", "outage"]) }).strict(),
  z.object({ status: z.literal("available"), providers: z.array(z.object({
    name: z.enum(["Carfax", "AutoCheck"]), originalReportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }).strict()).min(1).max(2) }).strict(),
]);
export const HistoryQuotePreviewSchema = z.object({
  format: HistoryDeliveryFormatSchema, deliveryFrom: DateTimeSchema, deliveryBy: DateTimeSchema,
  priceTmt: z.literal(100), providerRule: z.literal("either_available_both_when_obtainable"),
  terms: z.literal("service_failure_review"),
}).strict();
export const HistoryOfferSchema = z.object({
  version: Version, vin: z.string().max(80).nullable(), preflight: HistoryPreflightSchema.nullable(),
  proposal: HistoryQuotePreviewSchema.nullable(), synthetic: z.literal(true),
}).strict();
export type HistoryOffer = z.infer<typeof HistoryOfferSchema>;
export const HistoryOfferMutationSchema = z.object({ kind: z.literal("vin"), vin: VinInput, expectedVersion: Version }).strict();
const Check = z.object({ kind: z.literal("check"), vin: VinInput, expectedVersion: Version, expectedAssignmentVersion: Version }).strict();
const Propose = z.object({ kind: z.literal("propose"), expectedVersion: Version, expectedAssignmentVersion: Version,
  format: HistoryDeliveryFormatSchema, deliveryFrom: DateTimeSchema, deliveryBy: DateTimeSchema,
}).strict();
export const HistoryOperatorOfferMutationSchema = z.discriminatedUnion("kind", [Check, Propose])
  .refine((v) => v.kind !== "propose" || new Date(v.deliveryBy) > new Date(v.deliveryFrom));
export type HistoryOperatorOfferMutation = z.infer<typeof HistoryOperatorOfferMutationSchema>;
export const ReadHistoryOfferSchema = z.object({}).strict();
export const ReadOperatorHistoryOfferSchema = z.object({
  expectedAssignmentVersion: z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number).pipe(Version),
}).strict();
export const HistoryOfferActionSchema = z.object({
  id: z.string().guid(), scope: z.string().regex(/^[a-f0-9]{64}$/), expectedAssignmentVersion: Version,
  mutation: HistoryOperatorOfferMutationSchema.optional(),
}).strict();
