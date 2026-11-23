import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Post, Put, Query, Req, UseFilters } from "@nestjs/common";
import { HistoryPaymentProofSchemas as P, HistoryOfferSchemas as O } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import type { HistoryFileActor } from "../application/HistoryPrivateFileAccess";
import { ListHistoryPaymentProofs } from "../application/ListHistoryPaymentProofs";
import { StageHistoryPaymentProof } from "../application/StageHistoryPaymentProof";
import { UploadHistoryPaymentProof } from "../application/UploadHistoryPaymentProof";
import { SubmitHistoryPaymentProof } from "../application/SubmitHistoryPaymentProof";
import { ReadHistoryPaymentProof } from "../application/ReadHistoryPaymentProof";
import { DiscardHistoryPaymentProof } from "../application/DiscardHistoryPaymentProof";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryProofsExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };
@Controller("api/v1/vehicle-history")
@UseFilters(HistoryProofsExceptionFilter)
export class HistoryPaymentProofsController {
  constructor(@Inject(ListHistoryPaymentProofs) private readonly listProof: ListHistoryPaymentProofs,
    @Inject(StageHistoryPaymentProof) private readonly stageProof: StageHistoryPaymentProof,
    @Inject(UploadHistoryPaymentProof) private readonly uploadProof: UploadHistoryPaymentProof,
    @Inject(SubmitHistoryPaymentProof) private readonly submitProof: SubmitHistoryPaymentProof,
    @Inject(ReadHistoryPaymentProof) private readonly readProof: ReadHistoryPaymentProof,
    @Inject(DiscardHistoryPaymentProof) private readonly discardProof: DiscardHistoryPaymentProof) {}
  private actor(request: Request, query: unknown, operator = false): HistoryFileActor {
    const parsed = operator ? O.ReadOperatorHistoryOfferSchema.safeParse(query) : O.ReadHistoryOfferSchema.safeParse(query);
    if (!parsed.success) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    return { claims: request.user ?? {}, kind: operator ? "operator" : "requester",
      ...("expectedAssignmentVersion" in parsed.data ? { expectedAssignmentVersion: parsed.data.expectedAssignmentVersion } : {}) };
  }
  private file(id: string) {
    if (!P.PaymentProofSchema.shape.id.safeParse(id).success) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    return id;
  }
  @Get("requests/:id/payment-proofs")
  @Header("Cache-Control", "private, no-store")
  list(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) { return this.listProof.execute(this.actor(request, query), id); }

  @Post("requests/:id/payment-proofs")
  @Header("Cache-Control", "private, no-store")
  stage(@Req() request: Request, @Param("id") id: string, @Query() query: unknown, @Body() body: unknown) {
    const parsed = P.StagePaymentProofSchema.safeParse(body);
    if (!parsed.success) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    return this.stageProof.execute(this.actor(request, query), id, parsed.data);
  }
  @Put("requests/:id/payment-proofs/:fileId/content")
  @Header("Cache-Control", "private, no-store")
  upload(@Req() request: Request, @Param("id") id: string, @Param("fileId") fileId: string, @Query() query: unknown, @Body() body: unknown) {
    if (!Buffer.isBuffer(body)) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    return this.uploadProof.execute(this.actor(request, query), id, this.file(fileId), body, request.headers["content-type"] ?? "");
  }
  @Post("requests/:id/payment-proofs/:fileId/submit")
  @Header("Cache-Control", "private, no-store")
  submit(@Req() request: Request, @Param("id") id: string, @Param("fileId") fileId: string, @Query() query: unknown, @Body() body: unknown) {
    const parsed = P.SubmitPaymentProofSchema.safeParse(body);
    if (!parsed.success) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    return this.submitProof.execute(this.actor(request, query), id, this.file(fileId), parsed.data.orderId);
  }
  @Get("requests/:id/payment-proofs/:fileId/content")
  @Header("Cache-Control", "private, no-store")
  read(@Req() request: Request, @Param("id") id: string, @Param("fileId") fileId: string, @Query() query: unknown) {
    return this.readProof.execute(this.actor(request, query), id, this.file(fileId));
  }
  @Delete("requests/:id/payment-proofs/:fileId")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  discard(@Req() request: Request, @Param("id") id: string, @Param("fileId") fileId: string, @Query() query: unknown) {
    return this.discardProof.execute(this.actor(request, query), id, this.file(fileId));
  }
  @Get("operator/requests/:id/payment-proofs")
  @Header("Cache-Control", "private, no-store")
  staffList(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) { return this.listProof.execute(this.actor(request, query, true), id); }

  @Get("operator/requests/:id/payment-proofs/:fileId/content")
  @Header("Cache-Control", "private, no-store")
  staffRead(@Req() request: Request, @Param("id") id: string, @Param("fileId") fileId: string, @Query() query: unknown) {
    return this.readProof.execute(this.actor(request, query, true), id, this.file(fileId));
  }
  @Post("payment-evidence/read")
  @Header("Cache-Control", "private, no-store")
  historical(@Req() request: Request, @Body() body: unknown, @Query() query: unknown) {
    const parsed = P.HistoricalPaymentEvidenceSchema.safeParse(body);
    if (!parsed.success || !O.ReadHistoryOfferSchema.safeParse(query).success) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    return this.readProof.execute({ claims: request.user ?? {}, kind: "historical" }, parsed.data.requestId, parsed.data.fileId, parsed.data.reason);
  }
}
