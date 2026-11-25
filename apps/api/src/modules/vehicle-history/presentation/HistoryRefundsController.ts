import { Body, Controller, Get, Header, Inject, Param, Post, Req, UseFilters } from "@nestjs/common";
import { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryRefunds } from "../application/HistoryRefunds";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryRefundsExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };

@Controller("api/v1/vehicle-history/refunds")
@UseFilters(HistoryRefundsExceptionFilter)
export class HistoryRefundsController {
  constructor(@Inject(HistoryRefunds) private readonly refunds: HistoryRefunds) {}

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  decision(@Req() request: Request, @Param("id") id: string) {
    return this.run(request, id, "decision");
  }

  @Post(":id")
  @Header("Cache-Control", "private, no-store")
  approve(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(request, id, "decision", this.command(body, "approve"));
  }

  @Get(":id/execution")
  @Header("Cache-Control", "private, no-store")
  execution(@Req() request: Request, @Param("id") id: string) {
    return this.run(request, id, "execution");
  }

  @Post(":id/execution")
  @Header("Cache-Control", "private, no-store")
  record(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.run(request, id, "execution", this.command(body, "execute"));
  }

  private run(request: Request, id: string, mode: "decision" | "execution", input?: H.HistoryRefundCommand) {
    if (!H.HistoryAcceptedOrderSchema.shape.id.safeParse(id).success) throw new HistoryRequestError("HISTORY_REFUND_INVALID");
    return this.refunds.execute(request.user ?? {}, id, mode, input);
  }

  private command(body: unknown, kind: H.HistoryRefundCommand["kind"]) {
    const parsed = H.HistoryRefundCommandSchema.safeParse(body);
    if (!parsed.success || parsed.data.kind !== kind) throw new HistoryRequestError("HISTORY_REFUND_INVALID");
    return parsed.data;
  }
}
