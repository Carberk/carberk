import { DateTimeSchema, z } from "../zod";

import { HistoryOfferSchema, HistoryPreflightSchema, HistoryQuotePreviewSchema } from "./history-offer";
import { HistoryPaymentSummarySchema } from "./history-payment";

export const AcceptedHistoryOfferSchema = HistoryOfferSchema.extend({
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/),
  preflight: HistoryPreflightSchema.options[1],
  proposal: HistoryQuotePreviewSchema,
});
export const AcceptHistoryQuoteSchema = z.object({ offer: AcceptedHistoryOfferSchema }).strict();
export type AcceptHistoryQuote = z.infer<typeof AcceptHistoryQuoteSchema>;
export const HistoryAcceptedOrderSchema = z.object({
  id: z.string().guid(), acceptedOffer: AcceptedHistoryOfferSchema,
  acceptedAt: DateTimeSchema, holdExpiresAt: DateTimeSchema, deliveryDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export type HistoryAcceptedOrder = z.infer<typeof HistoryAcceptedOrderSchema>;
const ProviderName = HistoryPreflightSchema.options[1].shape.providers.element.shape.name;
const Version = z.number().int().min(0).max(2147483647);
export const HistoryCorrectionCauseSchema = z.enum(["customer_correction", "company_error"]);
const CorrectionIntent = z.object({ attemptKey: z.string().guid(), expectedVersion: Version });
export const HistoryCorrectionMutationSchema = z.discriminatedUnion("kind", [
  CorrectionIntent.extend({ kind: z.literal("request"), vin: z.string().min(1).max(80) }).strict(),
  CorrectionIntent.extend({ kind: z.literal("accept"), offer: AcceptedHistoryOfferSchema }).strict(),
]);
export type HistoryCorrectionMutation = z.infer<typeof HistoryCorrectionMutationSchema>;
export const HistoryOperatorCorrectionMutationSchema = CorrectionIntent.extend({
  kind: z.literal("review"), expectedAssignmentVersion: Version,
  cause: HistoryCorrectionCauseSchema, format: HistoryQuotePreviewSchema.shape.format,
}).strict();
export type HistoryOperatorCorrectionMutation = z.infer<typeof HistoryOperatorCorrectionMutationSchema>;
export const HistoryAcceptedRevisionSchema = z.object({ revision: Version, offer: AcceptedHistoryOfferSchema,
  acceptedAt: DateTimeSchema, cause: HistoryCorrectionCauseSchema.nullable() }).strict();
export const HistoryCorrectionStateSchema = z.object({
  version: Version, acceptedRevision: Version,
  accepted: z.array(HistoryAcceptedRevisionSchema).min(1),
  pending: z.object({ vin: z.string().max(80), requestedAt: DateTimeSchema,
    review: z.object({ offer: HistoryOfferSchema, cause: HistoryCorrectionCauseSchema }).strict().nullable(),
  }).strict().nullable(),
  handoff: z.object({ revision: Version, recordedAt: DateTimeSchema }).strict().nullable(),
}).strict();
export type HistoryCorrectionState = z.infer<typeof HistoryCorrectionStateSchema>;
export const HistoryCorrectionActionSchema = z.object({ id: z.string().guid(), scope: z.string().regex(/^[a-f0-9]{64}$/),
  expectedAssignmentVersion: Version, mutation: HistoryOperatorCorrectionMutationSchema.optional() }).strict();
const FulfilmentSource = z.enum(["archive", "new_source"]);
const OriginalReportDate = z.iso.date();
const FulfilmentAgreement = z.object({
  acceptedRevision: Version, vin: AcceptedHistoryOfferSchema.shape.vin, provider: ProviderName,
  format: HistoryQuotePreviewSchema.shape.format, originalReportDate: OriginalReportDate.nullable(),
}).strict();
const Obtained = z.object({ kind: z.literal("obtained"), format: HistoryQuotePreviewSchema.shape.format,
  originalReportDate: OriginalReportDate, permittedUse: z.boolean() }).strict();
const ProviderFailure = z.object({ kind: z.enum(["no_history", "format_unavailable", "company_error"]) }).strict();
const ResolvedOutcome = z.union([Obtained, ProviderFailure]);
const FulfilmentCommand = z.object({
  orderId: z.string().guid(), expectedAssignmentVersion: Version, expectedVersion: Version, attemptKey: z.string().guid(),
});
export const HistoryFulfilmentMutationSchema = z.discriminatedUnion("kind", [
  FulfilmentCommand.extend(FulfilmentAgreement.omit({ originalReportDate: true }).shape)
    .extend({ kind: z.literal("start"), source: FulfilmentSource }).strict(),
  FulfilmentCommand.extend({ kind: z.literal("record"), outcome: z.union([ResolvedOutcome, z.object({ kind: z.literal("uncertain") }).strict()]) }).strict(),
  FulfilmentCommand.extend({ kind: z.literal("reconcile"), outcome: z.union([ResolvedOutcome, z.object({ kind: z.literal("not_started") }).strict()]) }).strict(),
  FulfilmentCommand.extend({ kind: z.literal("retry") }).strict(),
  FulfilmentCommand.extend({ kind: z.literal("company_correction") }).strict(),
]);
export type HistoryFulfilmentMutation = z.infer<typeof HistoryFulfilmentMutationSchema>;

export const HistoryFulfilmentActionSchema = z.object({
  id: z.string().guid(), scope: z.string().regex(/^[a-f0-9]{64}$/), expectedAssignmentVersion: Version,
  mutation: HistoryFulfilmentMutationSchema.optional(),
}).strict().refine(({ id, expectedAssignmentVersion, mutation }) =>
  !mutation || mutation.orderId === id && mutation.expectedAssignmentVersion === expectedAssignmentVersion);

const RecoveryReason = z.enum(["no_history", "format_unavailable", "rights_unavailable", "original_date_mismatch", "company_error"]);
const Intent = z.object({ id: z.string().guid(), version: Version, attempt: Version, source: FulfilmentSource,
  funding: z.enum(["order", "company"]), accepted: FulfilmentAgreement, recordedAt: DateTimeSchema });
export const HistoryFulfilmentIntentSchema = z.discriminatedUnion("status", [
  Intent.extend({ status: z.enum(["pending", "uncertain", "retry_ready"]) }).strict(),
  Intent.extend({ status: z.literal("obtained"), report: Obtained.omit({ kind: true, permittedUse: true })
    .extend({ permittedUse: z.literal(true) }).strict() }).strict(),
  Intent.extend({ status: z.literal("recovery"), reason: RecoveryReason }).strict(),
]);
export type HistoryFulfilmentIntent = z.infer<typeof HistoryFulfilmentIntentSchema>;
export const HistoryFulfilmentViewSchema = z.object({
  accepted: FulfilmentAgreement, gate: z.enum(["ready", "pending_correction", "booking_closed", "fifo"]),
  sources: z.array(FulfilmentSource), intent: HistoryFulfilmentIntentSchema.nullable(),
}).strict();
export type HistoryFulfilmentView = z.infer<typeof HistoryFulfilmentViewSchema>;
export const HistoryPreparationSchema = z.enum(["queued", "preparing", "checking", "recovery"]);

export const HistoryOrderStateSchema = z.object({
  order: HistoryAcceptedOrderSchema.nullable(),
  agreement: HistoryCorrectionStateSchema.optional(),
  status: z.enum(["enquiry", "awaiting_synthetic_payment", "hold_expired", "receipt_submitted", "payment_review", "payment_confirmed", "payment_received_no_hold"]),
  payment: HistoryPaymentSummarySchema.optional(),
  reportPlan: z.object({ primary: ProviderName, second: ProviderName.nullable() }).strict().optional(),
  preparation: HistoryPreparationSchema.optional(), fulfilment: HistoryFulfilmentViewSchema.optional(),
  serverNow: DateTimeSchema, wallet: z.string().regex(/^SYNTHETIC-[A-Z0-9-]{1,64}$/).nullable(), collectionEnabled: z.literal(false),
}).strict();
export type HistoryOrderState = z.infer<typeof HistoryOrderStateSchema>;
