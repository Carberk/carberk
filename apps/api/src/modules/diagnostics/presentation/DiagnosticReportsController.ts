import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpException, Inject, Param, Post, Req } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import type { DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_REPORTS_PORT, type DiagnosticReportsPort } from "../domain/ports/DiagnosticReportsPort";

type Request = FastifyRequest & { user?: { sub?: string; sid?: string } };
const uuid = z.string().uuid();
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "DIAGNOSTIC_INVALID_INPUT", message: "Invalid diagnostic request" });
  return result.data;
}
@Controller("api/v1/diagnostics")
export class DiagnosticReportsController {
  constructor(@Inject(DIAGNOSTIC_REPORTS_PORT) private readonly reports: DiagnosticReportsPort) {}
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
}
