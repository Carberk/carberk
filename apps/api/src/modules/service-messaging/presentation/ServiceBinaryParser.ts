import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";
/** Only this explicit binary content type accepts the bounded private upload. */
@Injectable()
export class ServiceBinaryParser implements OnModuleInit {
 constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
 onModuleInit(): void {
  const fastify = this.adapter.httpAdapter.getInstance() as FastifyInstance;
  if (!fastify.hasContentTypeParser("application/octet-stream")) fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 20 * 1024 * 1024 }, (_request, body, done) => done(null, body));
 }
}
