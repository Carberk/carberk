import { BadRequestException, Controller, Get, Header, HttpException, Inject, Param, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";

import { Public } from "../../../common/public.decorator";
import { DiagnosticRuleError } from "../domain/InspectionOrder";
import { DIAGNOSTIC_PUBLIC_PORT, type DiagnosticPublicPort } from "../domain/ports/DiagnosticPublicPort";
import { DIAGNOSTIC_DOCUMENTS_PORT, type DiagnosticDocumentsPort } from "../domain/ports/DiagnosticDocumentsPort";

const uuid = z.string().uuid();
function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: "DIAGNOSTIC_INVALID_INPUT", message: "Invalid request" });
  return result.data;
}
@Public() @Controller("api/v1/public-diagnostics")
export class DiagnosticPublicController {
  constructor(@Inject(DIAGNOSTIC_PUBLIC_PORT) private readonly readers: DiagnosticPublicPort,
    @Inject(DIAGNOSTIC_DOCUMENTS_PORT) private readonly documents: DiagnosticDocumentsPort) {}
  private async run<T>(work: () => Promise<T>) {
    try { return await work(); }
    catch (error) {
      if (!(error instanceof DiagnosticRuleError)) throw error;
      const status = error.code === "DIAGNOSTIC_PDF_NOT_READY" ? 409 : error.code === "DIAGNOSTIC_PDF_UNAVAILABLE" ? 503 : 404;
      throw new HttpException({ code: status === 404 ? "NOT_FOUND" : error.code, message: "Report unavailable" }, status);
    }
  }
  @Get("listings") @Header("Cache-Control", "no-store, private") batch(@Query("ids") ids: string) {
    return this.run(() => this.readers.batch(parse(z.array(uuid).max(50), ids ? ids.split(",") : [])));
  }
  @Get("listings/:id") @Header("Cache-Control", "no-store, private") availability(@Param("id") id: string) {
    return this.run(() => this.readers.availability(parse(uuid, id)));
  }
  @Get("reports/:id") @Header("Cache-Control", "no-store, private") read(@Param("id") id: string) {
    return this.run(() => this.readers.read(parse(uuid, id)));
  }
  @Get("reports/:id/documents") @Header("Cache-Control", "no-store, private") list(@Param("id") id: string) {
    return this.run(() => this.documents.list(null, parse(uuid, id)));
  }
  @Get("reports/:id/documents/:locale") @Header("Cache-Control", "no-store, private") async download(@Param("id") id: string, @Param("locale") locale: string, @Res() reply: FastifyReply) {
    const bytes = await this.run(() => this.documents.download(null, parse(uuid, id), parse(z.enum(["tk", "ru", "en"]), locale)));
    reply.header("Cache-Control", "no-store, private").header("X-Content-Type-Options", "nosniff").header("Content-Disposition", "attachment; filename=inspection-report.pdf").type("application/pdf").send(Buffer.from(bytes));
  }
  @Get("reports/:id/evidence/:evidenceId") @Header("Cache-Control", "no-store, private") async image(@Param("id") id: string, @Param("evidenceId") evidenceId: string, @Res() reply: FastifyReply) {
    const image = await this.run(() => this.readers.evidence(parse(uuid, id), parse(uuid, evidenceId)));
    reply.header("Cache-Control", "no-store, private").header("X-Content-Type-Options", "nosniff").type(image.mime).send(Buffer.from(image.bytes));
  }
}
