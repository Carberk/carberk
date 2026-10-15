import { BadRequestException, Body, Controller, Get, Header, HttpException, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ServiceMessagingSchemas } from "@auto-tm/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { SERVICE_MESSAGING_PORT, type ServiceMessagingPort, type ServiceSubject } from "../domain/ports/ServiceMessagingPort";
import { ServiceDenied } from "../domain/serviceAccess";

type ServiceRequest = FastifyRequest & { user?: { sub?: string; sid?: string } };
const uuid = z.string().uuid();
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
 const parsed = schema.safeParse(value);
 if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Invalid service request" });
 return parsed.data;
}
@Controller("api/v1/services")
export class ServiceMessagingController {
 constructor(@Inject(SERVICE_MESSAGING_PORT) private readonly services: ServiceMessagingPort) {}
 private subject(req: ServiceRequest): ServiceSubject {
  if (!req.user?.sub || !req.user.sid) throw new HttpException({ code: "NO_ACCESS", message: "Service access unavailable" }, 403);
  return { userId: req.user.sub, sessionId: req.user.sid };
 }
 private async run<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
   if (!(error instanceof ServiceDenied)) throw error;
   const status = error.code === "COLLECTION_DISABLED" ? 503 : error.code === "STALE_ASSIGNMENT" || error.code === "IDEMPOTENCY_CONFLICT" ? 409 : error.code === "INVALID_ATTACHMENT" || error.code === "INVALID_MESSAGE" ? 400 : 403;
   throw new HttpException({ code: error.code, message: "Service request could not be completed" }, status);
  }
 }
 @Post("conversations") @Header("Cache-Control", "no-store, private")
 open(@Req() req: ServiceRequest, @Body() body: unknown) {
  const data = parse(ServiceMessagingSchemas.ServiceCreateSchema, body);
  if (!data.synthetic) throw new HttpException({ code: "COLLECTION_DISABLED", message: "Real collection is disabled" }, 503);
  return this.run(() => this.services.open(this.subject(req), data.purpose, data.sourceListingId));
 }
 @Get("conversations") @Header("Cache-Control", "no-store, private")
 mine(@Req() req: ServiceRequest) { return this.run(() => this.services.mine(this.subject(req))); }
 @Get("queue/:purpose") @Header("Cache-Control", "no-store, private")
 queue(@Req() req: ServiceRequest, @Param("purpose") purpose: string) { return this.run(() => this.services.queue(this.subject(req), parse(ServiceMessagingSchemas.ServicePurposeSchema, purpose))); }
 @Get("conversations/:id") @Header("Cache-Control", "no-store, private")
 read(@Req() req: ServiceRequest, @Param("id") id: string, @Query() query: unknown) {
  const page = parse(ServiceMessagingSchemas.ServicePageQuerySchema, query);
  return this.run(() => this.services.read(this.subject(req), parse(uuid, id), page.after, page.limit));
 }
 @Post("conversations/:id/messages") @Header("Cache-Control", "no-store, private")
 send(@Req() req: ServiceRequest, @Param("id") id: string, @Body() body: unknown) { return this.run(() => this.services.send(this.subject(req), parse(uuid, id), parse(ServiceMessagingSchemas.ServiceSendSchema, body))); }
 @Post("conversations/:id/assignment") @Header("Cache-Control", "no-store, private")
 assign(@Req() req: ServiceRequest, @Param("id") id: string, @Body() body: unknown) {
  const data = parse(ServiceMessagingSchemas.ServiceAssignSchema, body);
  return this.run(() => this.services.assign(this.subject(req), parse(uuid, id), data.expectedVersion, data.targetUserId));
 }
 @Post("conversations/:id/read") @Header("Cache-Control", "no-store, private")
 markRead(@Req() req: ServiceRequest, @Param("id") id: string, @Body() body: unknown) { return this.run(() => this.services.markRead(this.subject(req), parse(uuid, id), parse(ServiceMessagingSchemas.ServiceReadSchema, body).throughSequence)); }
 @Post("conversations/:id/attachments") @Header("Cache-Control", "no-store, private")
 stage(@Req() req: ServiceRequest, @Param("id") id: string, @Body() body: unknown) { return this.run(() => this.services.stage(this.subject(req), parse(uuid, id), parse(ServiceMessagingSchemas.ServiceStageAttachmentSchema, body))); }
 @Post("conversations/:id/attachments/:attachmentId/bytes") @Header("Cache-Control", "no-store, private")
 upload(@Req() req: ServiceRequest, @Param("id") id: string, @Param("attachmentId") attachmentId: string, @Body() body: unknown) {
  if (!(body instanceof Uint8Array)) throw new BadRequestException({ code: "INVALID_ATTACHMENT", message: "Binary upload required" });
  return this.run(() => this.services.upload(this.subject(req), parse(uuid, id), parse(uuid, attachmentId), body));
 }
 @Get("conversations/:id/attachments/:attachmentId")
 async file(@Req() req: ServiceRequest, @Param("id") id: string, @Param("attachmentId") attachmentId: string, @Res() reply: FastifyReply) {
  reply.header("Cache-Control", "no-store, private").header("X-Content-Type-Options", "nosniff");
  const file = await this.run(() => this.services.file(this.subject(req), parse(uuid, id), parse(uuid, attachmentId)));
  reply.header("Content-Type", file.contentType).header("Content-Disposition", `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.filename).replaceAll("'", "%27")}`);
  return reply.send(Buffer.from(file.bytes));
 }
}
