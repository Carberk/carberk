import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";

import { createMediaConversionMaintenanceServer } from "./common/media-conversion-maintenance";
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
  // A Fastify hook, not Nest middleware: see common/accept-language.ts.
  registerAcceptLanguageHook(httpAdapter.getInstance());

  app.enableShutdownHooks();

  const port = process.env["PORT"] ?? 3006;
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`API listening on port ${port}`, "NestApplication");
}

bootstrap();
