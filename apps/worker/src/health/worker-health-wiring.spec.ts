import "reflect-metadata";

import { PrismaService } from "@auto-tm/db";
import { ConfigService } from "@nestjs/config";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { Provider } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";

import {
  createWorkerHealthDependencies,
  WORKER_HEALTH_DEPENDENCIES,
  WorkerHealthServer,
} from "./worker-health-server";

afterEach(() => vi.unstubAllEnvs());

it("registers the health listener and its real dependency factory in normal worker boot", async () => {
  for (const [key, value] of Object.entries({
    NODE_ENV: "test",
    APP_ENV: "test",
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    MINIO_ENDPOINT: "http://localhost:9000",
    MINIO_ACCESS_KEY: "minioadmin",
    MINIO_SECRET_KEY: "minioadmin",
  })) vi.stubEnv(key, value);

  const { AppModule } = await import("../app.module");
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as Provider[];
  expect(providers).toContain(WorkerHealthServer);
  expect(providers).toContainEqual({
    provide: WORKER_HEALTH_DEPENDENCIES,
    inject: [ConfigService, PrismaService],
    useFactory: createWorkerHealthDependencies,
  });
});
