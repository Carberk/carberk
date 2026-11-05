import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { waitForMediaConversionMaintenance } from "./media-conversion-maintenance";
import { startMaintenanceHealthServer } from "./health/worker-health-server";

async function bootstrap() {
  if (process.env["PHOTO_CONVERSION_MAINTENANCE"] === "true") {
    const rawPort = process.env["PORT"] ?? "8080";
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be an integer between 1 and 65535");
    }
    const server = await startMaintenanceHealthServer(port);
    try { await waitForMediaConversionMaintenance(); }
    finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    return;
  }
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.get(Logger).log("Worker started (BullMQ consumer)", "Worker");
}

// The worker's health listener is private to its Railway service. An incomplete
// runtime contract must fail the process visibly: log the validation failure (Zod reports issue
// paths/messages, never secret values) and exit non-zero so the deploy is
// marked crashed instead of running a silently misconfigured consumer.
bootstrap().catch((error: unknown) => {
  console.error(
    "Worker boot failed: runtime contract incomplete or dependency misconfigured.",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
