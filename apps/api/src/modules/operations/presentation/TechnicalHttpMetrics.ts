import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { TechnicalMetrics } from "../infrastructure/TechnicalMetrics";

@Injectable()
export class TechnicalHttpMetrics implements OnModuleInit {
  constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost, @Inject(TechnicalMetrics) private readonly metrics: TechnicalMetrics) {}
  onModuleInit(): void {
    if (process.env["OPERATIONS_ENABLED"] !== "true") return;
    const server = this.adapter.httpAdapter.getInstance<FastifyInstance>();
    const started = new WeakMap<FastifyRequest, number>();
    server.addHook("onRequest", (request, _reply, done) => { started.set(request, performance.now()); done(); });
    server.addHook("onResponse", (request, reply, done) => {
      const at = started.get(request);
      started.delete(request);
      // Independent probes must not manufacture a large successful denominator on a quiet service.
      const probe = ["/healthz", "/readyz", "/api/v1/operations/health"].includes(request.routeOptions.url ?? "");
      if (at !== undefined && !probe) this.metrics.record(reply.statusCode, performance.now() - at);
      done();
    });
  }
}
