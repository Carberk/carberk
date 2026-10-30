import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { CHAT_ATTACHMENT_MAX_SIZE_BYTES } from "../domain/ChatAttachment";
import type { FastifyInstance } from "fastify";
@Injectable()
export class ConversationBinaryParser implements OnModuleInit {
 constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
 onModuleInit(): void {
  const fastify = this.adapter.httpAdapter.getInstance() as FastifyInstance;
  if (!fastify.hasContentTypeParser("image/webp")) fastify.addContentTypeParser("image/webp", { parseAs: "buffer", bodyLimit: CHAT_ATTACHMENT_MAX_SIZE_BYTES }, (_request, body, done) => done(null, body));
 }
}
