import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { Logger } from "nestjs-pino";

import { createMediaConversionMaintenanceServer } from "./common/media-conversion-maintenance";
import { registerGatewayAttributionHook } from "./common/gateway-attribution";
import { GatewayReplayStore } from "./common/gateway-replay-store";
import { AppModule } from "./app.module";
import { registerAcceptLanguageHook } from "./common/accept-language";
import { RealtimeIoAdapter } from "./modules/realtime/infrastructure/RealtimeIoAdapter";

async function bootstrap() {
  if (process.env["PHOTO_CONVERSION_MAINTENANCE"] === "true") {
    const server = createMediaConversionMaintenanceServer();
    await server.listen({ port: Number(process.env["PORT"] ?? 3006), host: "0.0.0.0" });
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    return;
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const realtimeAdapter = new RealtimeIoAdapter(app, {
    corsOrigin: config.get<string>("SOCKET_IO_CORS_ORIGIN") ?? "*",
    redisAdapterEnabled:
      config.get<boolean>("SOCKET_IO_REDIS_ADAPTER_ENABLED") ?? false,
    redisUrl: config.get<string>("REDIS_URL"),
  });
  await realtimeAdapter.configure();
  app.useWebSocketAdapter(realtimeAdapter);

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.getInstance().addHook("onRequest", (_req, _reply, done) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fastify request type
    const req = _req as any;
    if (!req.headers["x-request-id"]) {
      req.headers["x-request-id"] = randomUUID();
    }
    done();
  });
  const keys = config.get<Record<string, string>>("GATEWAY_ATTRIBUTION_KEYS") ?? {};
  const nonceStore = Object.keys(keys).length ? new Redis(config.getOrThrow<string>("REDIS_URL"), {
    commandTimeout: 1_000, connectTimeout: 1_000, maxRetriesPerRequest: 0, enableOfflineQueue: false,
  }) : undefined;
  // Deliberately no raw Redis error: connection details can contain credentials.
  nonceStore?.on("error", () => {});
  httpAdapter.getInstance().addHook("onClose", async () => { nonceStore?.disconnect(); });
  const replayStore = nonceStore ? new GatewayReplayStore(nonceStore) : undefined;
  registerGatewayAttributionHook(httpAdapter.getInstance(), {
    keys,
    claimNonce: async (key) => {
      if (!replayStore) throw new Error("Nonce store unavailable");
      return replayStore.claim(key);
    },
  });
  // A Fastify hook, not Nest middleware: see common/accept-language.ts.
  registerAcceptLanguageHook(httpAdapter.getInstance());

  app.enableShutdownHooks();

  const port = process.env["PORT"] ?? 3006;
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`API listening on port ${port}`, "NestApplication");
}

bootstrap();
