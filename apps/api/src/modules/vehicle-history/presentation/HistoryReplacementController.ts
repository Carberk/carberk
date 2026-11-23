import { Body, Controller, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryOfferSchemas as O, HistoryOrderSchemas as H } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryReplacementBooking } from "../application/HistoryReplacementBooking";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryOrdersExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };

@Controller("api/v1/vehicle-history")
@UseFilters(HistoryOrdersExceptionFilter)
export class HistoryReplacementController {
  constructor(@Inject(HistoryReplacementBooking) private readonly booking: HistoryReplacementBooking) {}

  @Post("requests/:id/replacement-booking")
  @Header("Cache-Control", "private, no-store")
  customer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = H.HistoryReplacementDecisionSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_REPLACEMENT_INVALID");
    return this.booking.execute({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Post("operator/requests/:id/replacement-booking")
  @Header("Cache-Control", "private, no-store")
  operator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = H.HistoryOperatorReplacementSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_REPLACEMENT_INVALID");
    return this.booking.execute({ claims: request.user ?? {}, operator: true, expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }
}
