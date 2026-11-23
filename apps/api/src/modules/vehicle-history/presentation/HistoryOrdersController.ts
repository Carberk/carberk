import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryOfferSchemas as O, HistoryOrderSchemas as H } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { ReadHistoryOrder } from "../application/ReadHistoryOrder";
import { HistoryFulfilment } from "../application/HistoryFulfilment";
import { AcceptHistoryQuote } from "../application/AcceptHistoryQuote";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryOrdersExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };

@Controller("api/v1/vehicle-history")
@UseFilters(HistoryOrdersExceptionFilter)
export class HistoryOrdersController {
  constructor(@Inject(HistoryFulfilment) private readonly fulfilment: HistoryFulfilment,
    @Inject(ReadHistoryOrder) private readonly readOrder: ReadHistoryOrder,
    @Inject(AcceptHistoryQuote) private readonly acceptQuote: AcceptHistoryQuote) {}

  @Get("requests/:id/order")
  @Header("Cache-Control", "private, no-store")
  customer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    if (!O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_ORDER_INVALID");
    return this.readOrder.execute({ claims: request.user ?? {}, operator: false }, id);
  }

  @Post("requests/:id/order")
  @Header("Cache-Control", "private, no-store")
  accept(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = H.AcceptHistoryQuoteSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_ORDER_INVALID");
    return this.acceptQuote.execute({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Get("operator/requests/:id/order")
  @Header("Cache-Control", "private, no-store")
  operator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = O.ReadOperatorHistoryOfferSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_ORDER_INVALID");
    return this.readOrder.execute({ claims: request.user ?? {}, operator: true, expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id);
  }

  @Post("operator/requests/:id/fulfilment")
  @Header("Cache-Control", "private, no-store")
  recordFulfilment(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = H.HistoryFulfilmentMutationSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_FULFILMENT_INVALID");
    return this.fulfilment.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }
}
