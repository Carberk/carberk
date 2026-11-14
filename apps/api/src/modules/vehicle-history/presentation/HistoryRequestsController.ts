import { HistoryRequestError } from "../domain/HistoryRequestError";
import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { VehicleHistorySchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { CreateHistoryRequest } from "../application/CreateHistoryRequest";
import { GetHistoryRequest } from "../application/GetHistoryRequest";
import { ListHistoryRequests } from "../application/ListHistoryRequests";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import type { HistoryRequestProjection } from "../application/HistoryRequestProjection";
import { HistoryRequestExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
const present = (item: Awaited<ReturnType<HistoryRequestProjection["one"]>>): VehicleHistorySchemas.HistoryRequest => ({
  ...item, createdAt: item.createdAt.toISOString(), status: "enquiry",
});

@Controller("api/v1/vehicle-history/requests")
@UseFilters(HistoryRequestExceptionFilter)
export class HistoryRequestsController {
  constructor(
    @Inject(CreateHistoryRequest) private readonly createRequest: CreateHistoryRequest,
    @Inject(ListHistoryRequests) private readonly listRequests: ListHistoryRequests,
    @Inject(GetHistoryRequest) private readonly getRequest: GetHistoryRequest,
  ) {}

  @Post()
  @Header("Cache-Control", "private, no-store")
  async create(@Req() request: Request, @Body() body: unknown) {
    const input = VehicleHistorySchemas.CreateHistoryRequestSchema.safeParse(body);
    if (!input.success) throw new HistoryRequestError("HISTORY_REQUEST_INVALID");
    return present(await this.createRequest.execute(request.user ?? {}, input.data));
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@Req() request: Request, @Query() query: unknown) {
    const input = VehicleHistorySchemas.ListHistoryRequestsQuerySchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_REQUEST_INVALID");
    const result = await this.listRequests.execute(request.user ?? {}, input.data.cursor);
    return { items: result.items.map(present), nextCursor: result.nextCursor };
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async detail(@Req() request: Request, @Param("id") id: string) {
    return present(await this.getRequest.execute(request.user ?? {}, id));
  }
}
