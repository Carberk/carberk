import "reflect-metadata";

import { randomUUID } from "node:crypto";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createMediaConversionMaintenanceServer } from "./common/media-conversion-maintenance";

async function bootstrap() {
  if (process.env["PHOTO_CONVERSION_MAINTENANCE"] === "true" || process.env["STAGING_CLEAN_RESET_EXECUTOR"] !== undefined) {
    const server = createMediaConversionMaintenanceServer();
    await server.listen({ port: Number(process.env["PORT"] ?? 3006), host: "0.0.0.0" });
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    return;
  }
  // Business imports can execute module registration code. They must not run
  // in the admitted reset executor, including after its automatic restart.
  const [{ NestFactory }, { FastifyAdapter }, { ConfigService }, { Logger }, { AppModule },
    { registerAcceptLanguageHook }, { RealtimeIoAdapter }] = await Promise.all([
    import("@nestjs/core"), import("@nestjs/platform-fastify"), import("@nestjs/config"), import("nestjs-pino"),
    import("./app.module"), import("./common/accept-language"), import("./modules/realtime/infrastructure/RealtimeIoAdapter"),
  ]);
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
