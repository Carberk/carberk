import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpException, Inject, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_REPORTS_PORT, type DiagnosticReportsPort } from "../domain/ports/DiagnosticReportsPort";

import { DIAGNOSTIC_EVIDENCE_PORT, type DiagnosticEvidencePort } from "../domain/ports/DiagnosticEvidencePort";

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
    @Inject(DIAGNOSTIC_EVIDENCE_PORT) private readonly evidence: DiagnosticEvidencePort) {}
  private subject(req: Request): DiagnosticSubject {
    if (!req.user?.sub || !req.user.sid) throw new ForbiddenException({ code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection access unavailable" });
    return { userId: req.user.sub, sessionId: req.user.sid };
  }
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (!(error instanceof DiagnosticRuleError)) throw error;
      const status = error.code.includes("STALE") || error.code.includes("CONFLICT") || error.code.includes("EXISTS") ? 409 : error.code === "DIAGNOSTIC_NO_ACCESS" ? 403 : 400;
      throw new HttpException({ code: error.code, message: "Inspection request could not be completed" }, status);
    }
  }
  @Post("orders/:id/reports") @Header("Cache-Control", "no-store, private") create(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(() => this.reports.create(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticDraftCreateSchema, body)));
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

}
