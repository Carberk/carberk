import { DateTimeSchema, z } from "../zod";

import { HistoryFulfilmentIntentSchema } from "./history-order";

const obtained = HistoryFulfilmentIntentSchema.options[1];
const { accepted, id, source, version } = obtained.shape;
export const MAX_REPORT_PDF_BYTES = 700 * 1024;
const PdfBase64 = z.base64().min(4).max(4 * Math.ceil(MAX_REPORT_PDF_BYTES / 3));
const Filename = z.string().max(160).regex(/^[^\p{Cc}\p{Cf}/\\]+\.pdf$/iu);
export const HistoryReportTargetSchema = z.object({
  orderId: id, intentId: id, intentVersion: version,
  acceptedRevision: accepted.shape.acceptedRevision, expectedAssignmentVersion: version,
}).strict();
export type HistoryReportTarget = z.infer<typeof HistoryReportTargetSchema>;
const QueryVersion = z.string().regex(/^\d{1,10}$/).pipe(z.coerce.number()).pipe(version);
export const HistoryReportQuerySchema = HistoryReportTargetSchema.extend({
  intentVersion: QueryVersion, acceptedRevision: QueryVersion, expectedAssignmentVersion: QueryVersion,
}).strict();
export const ValidateHistoryReportSchema = HistoryReportTargetSchema.extend({
  pdf: z.object({ filename: Filename, dataBase64: PdfBase64 }).strict().optional(),
  link: z.string().min(1).max(2048).optional(),
}).strict();
export type ValidateHistoryReport = z.infer<typeof ValidateHistoryReportSchema>;
export const DeliverHistoryReportSchema = HistoryReportTargetSchema.extend({ artifactId: id }).strict();
export type DeliverHistoryReport = z.infer<typeof DeliverHistoryReportSchema>;

export const HistoryReportFactsSchema = z.object({
  reportId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  provider: accepted.shape.provider, vin: accepted.shape.vin,
  originalReportDate: obtained.shape.report.shape.originalReportDate,
  language: z.string().regex(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/),
  permittedUse: z.boolean(),
}).strict();
export type HistoryReportFacts = z.infer<typeof HistoryReportFactsSchema>;
const Pdf = z.object({ filename: Filename, pages: z.number().int().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(MAX_REPORT_PDF_BYTES) }).strict();
const Artifact = z.object({ id, source, report: HistoryReportFactsSchema.extend({ permittedUse: z.literal(true) }) });
export const HistoryReportArtifactSchema = z.discriminatedUnion("format", [
  Artifact.extend({ format: z.literal("pdf"), pdf: Pdf }).strict(),
  Artifact.extend({ format: z.literal("link") }).strict(),
  Artifact.extend({ format: z.literal("both"), pdf: Pdf }).strict(),
]);
export type HistoryReportArtifact = z.infer<typeof HistoryReportArtifactSchema>;
export const DeliveredHistoryReportSchema = z.object({
  status: z.literal("delivered"), artifact: HistoryReportArtifactSchema, deliveredAt: DateTimeSchema,
}).strict();
export const PurchaserHistoryReportSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("empty") }).strict(), DeliveredHistoryReportSchema,
]);
export const HistoryReportViewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["empty", "staged"]) }).strict(),
  z.object({ status: z.literal("validated"), artifact: HistoryReportArtifactSchema, validatedAt: DateTimeSchema }).strict(),
  DeliveredHistoryReportSchema,
]);
export type HistoryReportView = z.infer<typeof HistoryReportViewSchema>;
export const HistoryReportContentSchema = z.object({ dataBase64: PdfBase64 }).strict();
export const HistoryReportLinkSchema = z.object({
  address: z.string().max(2048).regex(/^https:\/\/[^\s\\]+$/u),
}).strict();
