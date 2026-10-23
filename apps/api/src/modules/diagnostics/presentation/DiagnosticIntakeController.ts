import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpException, Inject, Optional, Param, Post, Req } from "@nestjs/common";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Public } from "../../../common/public.decorator";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_INTAKE_PORT, type DiagnosticIntakePort, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";

type Request = FastifyRequest & { user?: { sub?: string; sid?: string } };
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "DIAGNOSTIC_INVALID_INPUT", message: "Invalid diagnostic request" });
  return result.data;
}
const uuid = z.string().uuid();
@Controller("api/v1/diagnostics")
export class DiagnosticIntakeController {
  constructor(@Optional() @Inject(DIAGNOSTIC_INTAKE_PORT) private readonly intake?: DiagnosticIntakePort) {}
  private subject(req: Request): DiagnosticSubject {
    if (!req.user?.sub || !req.user.sid) throw new ForbiddenException({ code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection access unavailable" });
    return { userId: req.user.sub, sessionId: req.user.sid };
  }
  private async run<T>(work: (intake: DiagnosticIntakePort) => Promise<T>): Promise<T> {
    try {
      if (!this.intake) throw new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
      return await work(this.intake);
    } catch (error) {
      if (!(error instanceof DiagnosticRuleError)) throw error;
      const status = error.code.includes("STALE") || error.code.includes("CONFLICT") ? 409 : error.code === "DIAGNOSTIC_NO_ACCESS" || error.code === "DIAGNOSTIC_SERVICE_UNAVAILABLE" ? 403 : 400;
      throw new HttpException({ code: error.code, message: "Inspection request could not be completed" }, status);
    }
  }
  @Public() @Get("availability") @Header("Cache-Control", "no-store") availability(): { available: false } { return { available: false }; }
  @Post("orders") @Header("Cache-Control", "no-store, private") create(@Req() req: Request, @Body() body: unknown) {
    if (!this.intake || !(body && typeof body === "object" && "synthetic" in body && body.synthetic === true)) throw new ForbiddenException({ code: "DIAGNOSTIC_SERVICE_UNAVAILABLE", message: "Inspection service is unavailable" });
    return this.run(intake => intake.create(this.subject(req), parse(DiagnosticSchemas.DiagnosticCreateSchema, body)));
  }
  @Get("assigned") @Header("Cache-Control", "no-store, private") assigned(@Req() req: Request) { return this.run(intake => intake.assigned(this.subject(req))); }
  @Get("orders/:id/workspace") @Header("Cache-Control", "no-store, private") workspace(@Req() req: Request, @Param("id") id: string) { return this.run(intake => intake.workspace(this.subject(req), parse(uuid, id))); }
  @Get("orders") @Header("Cache-Control", "no-store, private") mine(@Req() req: Request) { return this.run(intake => intake.mine(this.subject(req))); }
  @Get("orders/:id/identity-records") @Header("Cache-Control", "no-store, private") identityRecords(@Req() req: Request, @Param("id") id: string) { return this.run(intake => intake.identityRecords(this.subject(req), parse(uuid, id))); }
  @Get("orders/:id") @Header("Cache-Control", "no-store, private") read(@Req() req: Request, @Param("id") id: string) { return this.run(intake => intake.read(this.subject(req), parse(uuid, id))); }
  @Get("centers/:id/queue") @Header("Cache-Control", "no-store, private") queue(@Req() req: Request, @Param("id") id: string) { return this.run(intake => intake.queue(this.subject(req), parse(uuid, id))); }
  @Get("centers/:id/templates") @Header("Cache-Control", "no-store, private") templates(@Req() req: Request, @Param("id") id: string) { return this.run(intake => intake.templates(this.subject(req), parse(uuid, id))); }
  @Post("centers/:id/templates") @Header("Cache-Control", "no-store, private") publish(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.run(intake => intake.publishTemplate(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.PublishDiagnosticTemplateSchema, body))); }
  @Post("orders/:id/authorization") @Header("Cache-Control", "no-store, private") authorize(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.run(intake => intake.authorize(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticAuthorizationSchema, body))); }
  @Post("orders/:id/appointment") @Header("Cache-Control", "no-store, private") appointment(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.run(intake => intake.appointment(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticAppointmentChangeSchema, body))); }
  @Post("orders/:id/assignments") @Header("Cache-Control", "no-store, private") assign(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.run(intake => intake.assign(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticAssignmentChangeSchema, body))); }
  @Post("orders/:id/vehicle") @Header("Cache-Control", "no-store, private") vehicle(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) { return this.run(intake => intake.observeVehicle(this.subject(req), parse(uuid, id), parse(DiagnosticSchemas.DiagnosticVehicleObservationRequestSchema, body))); }
}
