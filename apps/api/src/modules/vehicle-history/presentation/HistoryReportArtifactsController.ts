import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryReportArtifacts } from "../application/HistoryReportArtifacts";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryReportsExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };

function operator(request: Request, target: R.HistoryReportTarget) {
  return { claims: request.user ?? {}, operator: true, expectedAssignmentVersion: target.expectedAssignmentVersion };
}

@Controller("api/v1/vehicle-history/operator/requests/:id/report-artifacts")
@UseFilters(HistoryReportsExceptionFilter)
export class HistoryReportArtifactsController {
  constructor(@Inject(HistoryReportArtifacts) private readonly artifacts: HistoryReportArtifacts) {}

  @Get()
  read(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const target = R.HistoryReportQuerySchema.safeParse(query);
    if (!target.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.read(operator(request, target.data), id, target.data);
  }

  @Get("content")
  content(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const target = R.HistoryReportQuerySchema.safeParse(query);
    if (!target.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.content(operator(request, target.data), id, target.data);
  }

  @Post()
  validate(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const input = R.ValidateHistoryReportSchema.safeParse(body);
    if (!input.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.validate(operator(request, input.data), id, input.data);
  }
}
