import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";
@Injectable()
export class DiagnosticBinaryParser implements OnModuleInit {
  constructor(@Inject(HttpAdapterHost) private readonly adapters: HttpAdapterHost) {}
  onModuleInit(): void {
    const fastify = this.adapters.httpAdapter.getInstance<FastifyInstance>();
    if (!fastify.hasContentTypeParser("application/octet-stream")) fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 20 * 1024 * 1024 }, (_request, body, done) => done(null, body));
  }
}
