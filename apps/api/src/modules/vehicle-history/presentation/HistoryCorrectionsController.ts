import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryOfferSchemas as O, HistoryOrderSchemas as H } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryCorrections } from "../application/HistoryCorrections";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryOrdersExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
@Controller("api/v1/vehicle-history")
@UseFilters(HistoryOrdersExceptionFilter)
export class HistoryCorrectionsController {
  constructor(@Inject(HistoryCorrections) private readonly corrections: HistoryCorrections) {}

  @Get("requests/:id/correction")
  @Header("Cache-Control", "private, no-store")
  customer(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    if (!O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_CORRECTION_INVALID");
    return this.corrections.execute({ claims: request.user ?? {}, operator: false }, id);
  }

  @Post("requests/:id/correction")
  @Header("Cache-Control", "private, no-store")
  change(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = H.HistoryCorrectionMutationSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_CORRECTION_INVALID");
    return this.corrections.execute({ claims: request.user ?? {}, operator: false }, id, input.data);
  }

  @Get("operator/requests/:id/correction")
  @Header("Cache-Control", "private, no-store")
  operator(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = O.ReadOperatorHistoryOfferSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_CORRECTION_INVALID");
    return this.corrections.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id);
  }

  @Post("operator/requests/:id/correction")
  @Header("Cache-Control", "private, no-store")
  review(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const input = H.HistoryOperatorCorrectionMutationSchema.safeParse(body);
    if (!input.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_CORRECTION_INVALID");
    return this.corrections.execute({ claims: request.user ?? {}, operator: true,
      expectedAssignmentVersion: input.data.expectedAssignmentVersion }, id, input.data);
  }
}
