import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryOfferSchemas as O, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryPayments } from "../application/HistoryPayments";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryPaymentsExceptionFilter } from "./HistoryRequestExceptionFilter";

@Controller("api/v1/vehicle-history/operator/requests/:id/payment-verification")
@UseFilters(HistoryPaymentsExceptionFilter)
export class HistoryPaymentsController {
  constructor(@Inject(HistoryPayments) private readonly payments: HistoryPayments) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  read(@Req() request: FastifyRequest & { user?: HistoryRequesterClaims }, @Param("id") id: string, @Query() query: unknown) {
    const input = O.ReadOperatorHistoryOfferSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_PAYMENT_INVALID");
    return this.payments.execute({ claims: request.user ?? {}, operator: true, expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id);
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  verify(@Req() request: FastifyRequest & { user?: HistoryRequesterClaims }, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = P.HistoryPaymentCheckInputSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_PAYMENT_INVALID");
    return this.payments.execute({ claims: request.user ?? {}, operator: true, expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }
}
