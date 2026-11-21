import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryOfferSchemas as O } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
type Request = FastifyRequest & { user?: HistoryRequesterClaims };
import { HistoryOffers } from "../application/HistoryOffers";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryOffersExceptionFilter } from "./HistoryRequestExceptionFilter";

@Controller("api/v1/vehicle-history")
@UseFilters(HistoryOffersExceptionFilter)
export class HistoryOffersController {
  constructor(@Inject(HistoryOffers) private readonly offers: HistoryOffers) {}

  @Get("requests/:id/offer")
  @Header("Cache-Control", "private, no-store")
  customer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    if (!O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_OFFER_INVALID");
    return this.offers.read({ claims: request.user ?? {}, operator: false }, id);
  }

  @Post("requests/:id/offer")
  @Header("Cache-Control", "private, no-store")
  vin(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = O.HistoryOfferMutationSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_OFFER_INVALID");
    return this.offers.change({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Get("operator/requests/:id/offer")
  @Header("Cache-Control", "private, no-store")
  operator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = O.ReadOperatorHistoryOfferSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_OFFER_INVALID");
    return this.offers.read({ claims: request.user ?? {}, operator: true, expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id);
  }

  @Post("operator/requests/:id/offer")
  @Header("Cache-Control", "private, no-store")
  change(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = O.HistoryOperatorOfferMutationSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_OFFER_INVALID");
    return this.offers.change({ claims: request.user ?? {}, operator: true, expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }
}
