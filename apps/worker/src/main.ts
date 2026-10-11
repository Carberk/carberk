import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { waitForMediaConversionMaintenance } from "./media-conversion-maintenance";

import { AppModule } from "./app.module";

async function bootstrap() {
  if (process.env["PHOTO_CONVERSION_MAINTENANCE"] === "true") {
    await waitForMediaConversionMaintenance();
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.get(Logger).log("Worker started (BullMQ consumer)", "Worker");
}

// The worker has no public route, so an incomplete runtime contract must
// fail the process visibly: log the validation failure (Zod reports issue
// paths/messages, never secret values) and exit non-zero so the deploy is
// marked crashed instead of running a silently misconfigured consumer.
bootstrap().catch((error: unknown) => {
  console.error(
    "Worker boot failed: runtime contract incomplete or dependency misconfigured.",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
