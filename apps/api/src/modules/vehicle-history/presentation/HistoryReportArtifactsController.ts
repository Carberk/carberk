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

const operatorPath = "operator/requests/:id/report-artifacts";
const purchaserPath = "requests/:id/report";

@Controller("api/v1/vehicle-history")
@UseFilters(HistoryReportsExceptionFilter)
export class HistoryReportArtifactsController {
  constructor(@Inject(HistoryReportArtifacts) private readonly artifacts: HistoryReportArtifacts) {}

  @Get(operatorPath)
  read(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const target = R.HistoryReportQuerySchema.safeParse(query);
    if (!target.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.read(operator(request, target.data), id, target.data);
  }

  @Get(operatorPath + "/content")
  content(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const target = R.HistoryReportQuerySchema.safeParse(query);
    if (!target.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.content(operator(request, target.data), id, target.data);
  }

  @Post(operatorPath)
  validate(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const input = R.ValidateHistoryReportSchema.safeParse(body);
    if (!input.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.validate(operator(request, input.data), id, input.data);
  }

  @Post(operatorPath + "/deliver")
  deliver(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const input = R.DeliverHistoryReportSchema.safeParse(body);
    if (!input.success) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.artifacts.deliver(operator(request, input.data), id, input.data);
  }

  @Get(purchaserPath)
  purchased(@Req() request: Request, @Param("id") id: string) {
    return this.artifacts.purchaser(request.user ?? {}, id);
  }

  @Get(purchaserPath + "/:artifactId/:kind")
  purchasedAsset(@Req() request: Request, @Param("id") id: string, @Param("artifactId") artifactId: string, @Param("kind") kind: string) {
    if (!R.DeliverHistoryReportSchema.shape.artifactId.safeParse(artifactId).success || (kind !== "pdf" && kind !== "link")) {
      throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    }
    return this.artifacts.purchaser(request.user ?? {}, id, { id: artifactId, kind });
  }
}
