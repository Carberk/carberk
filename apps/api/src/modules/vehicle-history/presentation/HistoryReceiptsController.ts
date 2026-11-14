import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { VehicleHistorySchemas as Schemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { AcknowledgeHistoryMessages } from "../application/AcknowledgeHistoryMessages";
import { ReadHistoryReceipts } from "../application/ReadHistoryReceipts";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryMessagesExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
@Controller("api/v1/vehicle-history")
@UseFilters(HistoryMessagesExceptionFilter)
export class HistoryReceiptsController {
  constructor(@Inject(AcknowledgeHistoryMessages) private readonly ack: AcknowledgeHistoryMessages,
    @Inject(ReadHistoryReceipts) private readonly read: ReadHistoryReceipts) {}

  @Post("requests/:id/receipts")
  @Header("Cache-Control", "private, no-store")
  acknowledgeCustomer(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.AcknowledgeHistoryMessagesSchema.safeParse(body);
    if (!input.success || !Schemas.ReadHistoryReceiptsSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.ack.execute({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Get("requests/:id/receipts")
  @Header("Cache-Control", "private, no-store")
  readCustomer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    if (!Schemas.ReadHistoryReceiptsSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.read.execute({ claims: request.user ?? {}, operator: false }, id);
  }

  @Post("operator/requests/:id/receipts")
  @Header("Cache-Control", "private, no-store")
  acknowledgeOperator(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.AcknowledgeOperatorHistoryMessagesSchema.safeParse(body);
    if (!input.success || !Schemas.ReadHistoryReceiptsSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.ack.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }

  @Get("operator/requests/:id/receipts")
  @Header("Cache-Control", "private, no-store")
  readOperator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = Schemas.ReadOperatorHistoryReceiptsSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.read.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id);
  }
}
