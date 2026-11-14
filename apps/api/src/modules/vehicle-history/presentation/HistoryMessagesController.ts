import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { VehicleHistorySchemas as Schemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { SendHistoryText } from "../application/SendHistoryText";
import { ReadHistoryMessages } from "../application/ReadHistoryMessages";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryMessagesExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
@Controller("api/v1/vehicle-history")
@UseFilters(HistoryMessagesExceptionFilter)
export class HistoryMessagesController {
  constructor(@Inject(SendHistoryText) private readonly send: SendHistoryText,
    @Inject(ReadHistoryMessages) private readonly read: ReadHistoryMessages) {}

  @Post("requests/:id/messages")
  @Header("Cache-Control", "private, no-store")
  sendCustomer(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.SendHistoryTextSchema.safeParse(body);
    if (!input.success || !Schemas.HistoryMessageSendQuerySchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.send.execute({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Get("requests/:id/messages")
  @Header("Cache-Control", "private, no-store")
  readCustomer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = Schemas.ReadHistoryMessagesSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.read.execute({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Post("operator/requests/:id/messages")
  @Header("Cache-Control", "private, no-store")
  sendOperator(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.SendOperatorHistoryTextSchema.safeParse(body);
    if (!input.success || !Schemas.HistoryMessageSendQuerySchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.send.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }

  @Get("operator/requests/:id/messages")
  @Header("Cache-Control", "private, no-store")
  readOperator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = Schemas.ReadOperatorHistoryMessagesSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    return this.read.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }
}
