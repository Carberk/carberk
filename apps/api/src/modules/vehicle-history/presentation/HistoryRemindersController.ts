import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { VehicleHistorySchemas as Schemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { ReadHistoryReminder } from "../application/ReadHistoryReminder";
import { StopHistoryReminders } from "../application/StopHistoryReminders";
import { SendHistoryReminder } from "../application/SendHistoryReminder";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryRemindersExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
@Controller("api/v1/vehicle-history")
@UseFilters(HistoryRemindersExceptionFilter)
export class HistoryRemindersController {
  constructor(@Inject(ReadHistoryReminder) private readonly read: ReadHistoryReminder,
    @Inject(StopHistoryReminders) private readonly stop: StopHistoryReminders,
    @Inject(SendHistoryReminder) private readonly send: SendHistoryReminder) {}

  @Post("operator/requests/:id/reminder")
  @Header("Cache-Control", "private, no-store")
  sendOperator(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.SendHistoryReminderSchema.safeParse(body);
    if (!input.success || !Schemas.ReadHistoryReminderSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_REMINDER_INVALID");
    return this.send.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data, request.headers["accept-language"]);
  }

  @Get("requests/:id/reminder")
  @Header("Cache-Control", "private, no-store")
  readCustomer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    if (!Schemas.ReadHistoryReminderSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_REMINDER_INVALID");
    return this.read.execute({ claims: request.user ?? {}, operator: false }, id);
  }

  @Get("operator/requests/:id/reminder")
  @Header("Cache-Control", "private, no-store")
  readOperator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = Schemas.ReadOperatorHistoryReminderSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_REMINDER_INVALID");
    return this.read.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id);
  }

  @Post("requests/:id/reminder/stop")
  @Header("Cache-Control", "private, no-store")
  stopCustomer(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.StopHistoryRemindersSchema.safeParse(body);
    if (!input.success || !Schemas.ReadHistoryReminderSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_REMINDER_INVALID");
    return this.stop.execute({ claims: request.user ?? {}, operator: false }, id, input.data.expectedWaitingVersion);
  }
}
