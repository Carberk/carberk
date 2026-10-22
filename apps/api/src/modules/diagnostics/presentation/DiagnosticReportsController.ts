import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpException, Inject, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { IssueDiagnosticContinuityProof } from "../application/IssueDiagnosticContinuityProof";
import { ReadDiagnosticContinuityProof } from "../application/ReadDiagnosticContinuityProof";
import { ConsumeDiagnosticContinuityProof } from "../application/ConsumeDiagnosticContinuityProof";
import { DIAGNOSTIC_REPORTS_PORT, type DiagnosticReportsPort } from "../domain/ports/DiagnosticReportsPort";

import { DIAGNOSTIC_EVIDENCE_PORT, type DiagnosticEvidencePort } from "../domain/ports/DiagnosticEvidencePort";

import { DIAGNOSTIC_DOCUMENTS_PORT, type DiagnosticDocumentsPort } from "../domain/ports/DiagnosticDocumentsPort";
import { DIAGNOSTIC_IDENTITY_EVIDENCE_PORT, type DiagnosticIdentityEvidencePort } from "../domain/ports/DiagnosticIdentityEvidencePort";

type Request = FastifyRequest & { user?: { sub?: string; sid?: string } };
const uuid = z.string().uuid();
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "DIAGNOSTIC_INVALID_INPUT", message: "Invalid diagnostic request" });
  return result.data;
}
@Controller("api/v1/diagnostics")
export class DiagnosticReportsController {
  constructor(@Inject(DIAGNOSTIC_REPORTS_PORT) private readonly reports: DiagnosticReportsPort,
    @Inject(IssueDiagnosticContinuityProof) private readonly issueContinuityProof: IssueDiagnosticContinuityProof,
    @Inject(ReadDiagnosticContinuityProof) private readonly readContinuityProof: ReadDiagnosticContinuityProof,
    @Inject(ConsumeDiagnosticContinuityProof) private readonly consumeContinuityProof: ConsumeDiagnosticContinuityProof,
    @Inject(DIAGNOSTIC_EVIDENCE_PORT) private readonly evidence: DiagnosticEvidencePort,
    @Inject(DIAGNOSTIC_DOCUMENTS_PORT) private readonly documents: DiagnosticDocumentsPort,
    @Inject(DIAGNOSTIC_IDENTITY_EVIDENCE_PORT) private readonly identity: DiagnosticIdentityEvidencePort) {}
  private subject(req: Request): DiagnosticSubject {
    if (!req.user?.sub || !req.user.sid) throw new ForbiddenException({ code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection access unavailable" });
    return { userId: req.user.sub, sessionId: req.user.sid };
  }
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (!(error instanceof DiagnosticRuleError)) throw error;
      const status = error.code.includes("STALE") || error.code.includes("CONFLICT") || error.code.includes("EXISTS") || error.code === "DIAGNOSTIC_PDF_NOT_READY" ? 409 : error.code === "DIAGNOSTIC_NO_ACCESS" ? 403 : ["DIAGNOSTIC_PDF_UNAVAILABLE", "DIAGNOSTIC_EVIDENCE_UNAVAILABLE"].includes(error.code) ? 503 : 400;
      throw new HttpException({ code: error.code, message: "Inspection request could not be completed" }, status);
    }
  }
  @Post("orders/:id/reports") @Header("Cache-Control", "no-store, private") create(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(() => this.reports.create(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticDraftCreateSchema, body)));
  }
  @Post("orders/:id/reinspections") @Header("Cache-Control", "no-store, private") reinspect(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    // A named proof selects private consumption; without one only the temporary public admission applies.
    return this.run(() => {
      const subject = this.subject(req); const orderId = parse(uuid, id); const input = parse(DiagnosticSchemas.DiagnosticReinspectionSchema, body);
      const { proofId } = input;
      return proofId ? this.consumeContinuityProof.execute(subject, orderId, { ...input, proofId }) : this.reports.reinspect(subject, orderId, input);
    });
  }
  @Get("orders/:id/reinspection-comparison") comparison(@Req() req: Request, @Param("id") id: string, @Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    // Set before authorization so uniform denials carry the same private cache policy.
    reply.header("Cache-Control", "no-store, private");
    return this.run(() => this.reports.comparison(this.subject(req), parse(uuid, id), parse(z.object({ predecessorId: uuid }).strict(), query).predecessorId));
  }
  @Post("orders/:id/continuity-proofs") issueProof(@Req() req: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    parse(z.object({}).strict(), query);
    return this.run(() => this.issueContinuityProof.execute(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticContinuityProofIssuanceSchema, body)));
  }
  @Get("orders/:id/continuity-proofs/:proofId") readProof(@Req() req: Request, @Param("id") id: string, @Param("proofId") proofId: string, @Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    parse(z.object({}).strict(), query);
    return this.run(() => this.readContinuityProof.execute(this.subject(req), parse(uuid, id), parse(uuid, proofId)));
  }
  /** Restricted identity routes set private/no-store before validation so syntax errors and
   * uniform denials carry the same cache policy as successful responses. */
  @Post("orders/:id/identity-provenance") stage(@Req() req: Request, @Param("id") id: string, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    return this.run(() => this.identity.stage(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticIdentityProvenanceStageSchema, body)));
  }
  @Put("orders/:id/identity-provenance/:provenanceId") uploadProvenance(@Req() req: Request, @Param("id") id: string, @Param("provenanceId") provenanceId: string, @Query() query: unknown, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    const input = parse(z.object({ expectedOrderVersion: z.coerce.number().int().nonnegative() }).strict(), query);
    const mime = parse(z.enum(["image/jpeg", "image/png", "image/webp"]), req.headers["x-evidence-type"]);
    return this.run(() => this.identity.upload(this.subject(req), parse(uuid, id), parse(uuid, provenanceId), { ...input, mime, bytes: Buffer.isBuffer(body) ? body : null }));
  }
  @Get("orders/:id/identity-provenance/:provenanceId") async provenance(@Req() req: Request, @Param("id") id: string, @Param("provenanceId") provenanceId: string, @Res() reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    const image = await this.run(() => this.identity.read(this.subject(req), parse(uuid, id), parse(uuid, provenanceId)));
    reply.header("X-Content-Type-Options", "nosniff").type(image.mime).send(Buffer.from(image.bytes));
  }
  @Post("orders/:id/identity-evidence") append(@Req() req: Request, @Param("id") id: string, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    return this.run(() => this.identity.append(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticIdentityEvidenceCaptureSchema, body)));
  }
  @Get("orders/:id/identity-evidence") identityEvidence(@Req() req: Request, @Param("id") id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    return this.run(() => this.identity.list(this.subject(req), parse(uuid, id)));
  }
  @Get("orders/:id/reinspection-comparison/provenance/:provenanceId") async comparisonProvenance(@Req() req: Request, @Param("id") id: string, @Param("provenanceId") provenanceId: string, @Query() query: unknown, @Res() reply: FastifyReply) {
    reply.header("Cache-Control", "no-store, private");
    const image = await this.run(() => this.reports.comparisonProvenance(this.subject(req), parse(uuid, id), parse(z.object({ predecessorId: uuid }).strict(), query).predecessorId, parse(uuid, provenanceId)));
    reply.header("X-Content-Type-Options", "nosniff").type(image.mime).send(Buffer.from(image.bytes));
  }
  @Get("orders/:id/reports") @Header("Cache-Control", "no-store, private") forOrder(@Req() req: Request, @Param("id") id: string) {
    return this.run(() => this.reports.forOrder(this.subject(req), parse(uuid, id)));
  }
  @Get("reports/:id") @Header("Cache-Control", "no-store, private") read(@Req() req: Request, @Param("id") id: string) {
    return this.run(() => this.reports.read(this.subject(req), parse(uuid, id)));
  }
  @Post("reports/:id/findings") @Header("Cache-Control", "no-store, private") save(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(() => this.reports.save(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticFindingSaveSchema, body)));
  }
  @Post("reports/:id/transition") @Header("Cache-Control", "no-store, private") transition(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(() => this.reports.transition(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticReportTransitionSchema, body)));
  }
  @Post("reports/:id/corrections") @Header("Cache-Control", "no-store, private") correct(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(() => this.reports.correct(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticCorrectionSchema, body)));
  }
  @Put("reports/:id/evidence/:evidenceId") @Header("Cache-Control", "no-store, private") upload(@Req() req: Request, @Param("id") id: string, @Param("evidenceId") evidenceId: string, @Query() query: unknown, @Body() body: unknown) {
    const input = parse(z.object({ findingId: z.string().uuid(), expectedVersion: z.coerce.number().int().nonnegative() }).strict(), query);
    if (!Buffer.isBuffer(body)) throw new BadRequestException({ code: "REPORT_EVIDENCE_INVALID", message: "Binary evidence required" });
    const mime = parse(z.enum(["image/jpeg", "image/png", "image/webp"]), req.headers["x-evidence-type"]);
    return this.run(() => this.evidence.upload(this.subject(req), { reportId: parse(uuid, id), evidenceId: parse(uuid, evidenceId), ...input, mime, bytes: body }));
  }
  @Get("reports/:id/evidence/:evidenceId") @Header("Cache-Control", "no-store, private") async image(@Req() req: Request, @Param("id") id: string, @Param("evidenceId") evidenceId: string, @Res() reply: FastifyReply) {
    const image = await this.run(() => this.evidence.read(this.subject(req), parse(uuid, id), parse(uuid, evidenceId)));
    reply.header("Cache-Control", "no-store, private").header("X-Content-Type-Options", "nosniff").type(image.mime).send(Buffer.from(image.bytes));
  }
  @Post("reports/:id/evidence/:evidenceId/abandon") @Header("Cache-Control", "no-store, private") abandon(@Req() req: Request, @Param("id") id: string, @Param("evidenceId") evidenceId: string) {
    return this.run(() => this.evidence.abandon(this.subject(req), parse(uuid, id), parse(uuid, evidenceId)));
  }

  @Get("reports/:id/documents") @Header("Cache-Control", "no-store, private") listDocuments(@Req() req: Request, @Param("id") id: string) {
    return this.run(() => this.documents.list(this.subject(req), parse(uuid, id)));
  }
  @Get("reports/:id/documents/:locale") @Header("Cache-Control", "no-store, private") async download(@Req() req: Request, @Param("id") id: string, @Param("locale") locale: string, @Res() reply: FastifyReply) {
    const bytes = await this.run(() => this.documents.download(this.subject(req), parse(uuid, id), parse(z.enum(["tk", "ru", "en"]), locale)));
    reply.header("Cache-Control", "no-store, private").header("X-Content-Type-Options", "nosniff").header("Content-Disposition", "attachment; filename=inspection-report.pdf").type("application/pdf").send(Buffer.from(bytes));
  }

}
