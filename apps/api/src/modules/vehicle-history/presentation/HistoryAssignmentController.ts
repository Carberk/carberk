import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { VehicleHistorySchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { ListOperatorHistoryRequests } from "../application/ListOperatorHistoryRequests";
import { GetOperatorHistoryRequest } from "../application/GetOperatorHistoryRequest";
import { ClaimHistoryRequest } from "../application/ClaimHistoryRequest";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryRequestExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
@Controller("api/v1/vehicle-history/operator/requests")
@UseFilters(HistoryRequestExceptionFilter)
export class HistoryAssignmentController {
  constructor(
    @Inject(ListOperatorHistoryRequests) private readonly listRequests: ListOperatorHistoryRequests,
    @Inject(GetOperatorHistoryRequest) private readonly getRequest: GetOperatorHistoryRequest,
    @Inject(ClaimHistoryRequest) private readonly claimRequest: ClaimHistoryRequest,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@Req() request: Request, @Query() query: unknown) {
    const input = VehicleHistorySchemas.HistoryQueueQuerySchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_REQUEST_INVALID");
    const result = await this.listRequests.execute(request.user ?? {}, input.data);
    return { items: result.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), status: "enquiry" })),
      nextCursor: result.nextCursor };
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async detail(@Req() request: Request, @Param("id") id: string) {
    const item = await this.getRequest.execute(request.user ?? {}, id);
    return { ...item, createdAt: item.createdAt.toISOString(), status: "enquiry" };
  }

  @Post(":id/claim")
  @Header("Cache-Control", "private, no-store")
  async claim(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const input = VehicleHistorySchemas.ClaimHistoryRequestSchema.safeParse(body);
    if (!input.success) throw new HistoryRequestError("HISTORY_REQUEST_INVALID");
    const item = await this.claimRequest.execute(request.user ?? {}, id, input.data.expectedAssignmentVersion);
    return { ...item, createdAt: item.createdAt.toISOString(), status: "enquiry" };
  }
}
