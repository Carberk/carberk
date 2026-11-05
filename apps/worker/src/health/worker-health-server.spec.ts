import { request } from "node:http";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { PrismaService } from "@auto-tm/db";
import { S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env.schema";

const boundaries = vi.hoisted(() => ({
  redis: { connect: vi.fn(), ping: vi.fn(), disconnect: vi.fn(), on: vi.fn() },
  s3: { send: vi.fn(), destroy: vi.fn() },
}));

vi.mock("ioredis", () => ({ Redis: vi.fn(function () { return boundaries.redis; }) }));
vi.mock("@aws-sdk/client-s3", () => ({
  ListBucketsCommand: vi.fn(function () {}),
  S3Client: vi.fn(function () { return boundaries.s3; }),
}));

import { runReadinessChecks } from "./readiness";
import {
  createWorkerHealthDependencies,
  WORKER_HEALTH_DEPENDENCIES,
  WorkerHealthServer,
  startMaintenanceHealthServer,
} from "./worker-health-server";

function config(values: Record<string, string | number>) {
  return {
    get: (name: string) => values[name],
  } as ConfigService<Env, true>;
}

function postgresBoundary() {
  const executeRaw = vi.fn().mockResolvedValue(undefined);
  const queryRaw = vi.fn().mockResolvedValue([]);
  const transaction = vi.fn(async (callback: (client: { $executeRawUnsafe: typeof executeRaw; $queryRaw: typeof queryRaw }) => Promise<void>) => {
    await callback({ $executeRawUnsafe: executeRaw, $queryRaw: queryRaw });
  });
  return { executeRaw, queryRaw, transaction, prisma: { $transaction: transaction } as unknown as PrismaService };
}

const dependencyConfig = {
  REDIS_URL: "redis://healthy",
  MINIO_ENDPOINT: "http://healthy",
  MINIO_REGION: "us-east-1",
  MINIO_ACCESS_KEY: "key",
  MINIO_SECRET_KEY: "secret",
};

async function startHealth(values: Record<string, string | number>, prisma: PrismaService) {
  class HealthTestModule { marker(): void {} }
  const app = await NestFactory.createApplicationContext({
    module: HealthTestModule,
    providers: [
      WorkerHealthServer,
      { provide: ConfigService, useValue: config({ ...dependencyConfig, ...values }) },
      { provide: WORKER_HEALTH_DEPENDENCIES, useFactory: (configService: ConfigService<Env, true>) => createWorkerHealthDependencies(configService, prisma), inject: [ConfigService] },
    ],
  }, { logger: false });
  return { app, health: app.get(WorkerHealthServer) };
}

function httpGet(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.end();
  });
}

function portOf(server: WorkerHealthServer): number {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}

describe("worker readiness checks", () => {
  it("runs checks concurrently and reports all healthy dependencies", async () => {
    const result = await runReadinessChecks({ postgres: async () => undefined, redis: async () => undefined }, 50);
    expect(result).toEqual({ ready: true, checks: { postgres: "ok", redis: "ok" } });
  });

  it("marks a failed or timed-out dependency without leaking its error", async () => {
    const result = await runReadinessChecks({
      postgres: async () => { throw new Error("postgres://secret"); },
      redis: () => new Promise<void>(() => undefined),
    }, 5);
    expect(result).toEqual({ ready: false, checks: { postgres: "failed", redis: "failed" } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("worker health HTTP contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.mocked(Redis).mockClear();
    vi.mocked(S3Client).mockClear();
    boundaries.redis.connect.mockReset().mockResolvedValue(undefined);
    boundaries.redis.ping.mockReset().mockResolvedValue("PONG");
    boundaries.redis.disconnect.mockReset();
    boundaries.redis.on.mockReset();
    boundaries.s3.send.mockReset().mockResolvedValue({});
    boundaries.s3.destroy.mockReset();
  });

  it("uses bounded production probes and cleans up their clients", async () => {
    const { executeRaw, queryRaw, transaction, prisma } = postgresBoundary();
    const dependencies = createWorkerHealthDependencies(config(dependencyConfig), prisma);

    await dependencies.postgres();
    expect(executeRaw).toHaveBeenCalledWith("SET LOCAL statement_timeout = 1500");
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 1500, timeout: 1500 });
    await dependencies.redis();
    expect(Redis).toHaveBeenCalledWith("redis://healthy", expect.objectContaining({ connectTimeout: 1500, commandTimeout: 1500, maxRetriesPerRequest: 0 }));
    expect(boundaries.redis.connect).toHaveBeenCalledOnce();
    expect(boundaries.redis.ping).toHaveBeenCalledOnce();
    expect(boundaries.redis.disconnect).toHaveBeenCalledOnce();
    await dependencies.minio();
    expect(boundaries.s3.send).toHaveBeenCalledWith(expect.anything(), { abortSignal: expect.any(AbortSignal) });
    expect(boundaries.s3.destroy).toHaveBeenCalledOnce();
  });

  it("releases Redis and MinIO clients when dependency calls fail", async () => {
    const dependencies = createWorkerHealthDependencies(config(dependencyConfig), postgresBoundary().prisma);
    boundaries.redis.ping.mockRejectedValueOnce(new Error("redis unavailable"));
    boundaries.s3.send.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(dependencies.redis()).rejects.toThrow("redis unavailable");
    await expect(dependencies.minio()).rejects.toThrow("storage unavailable");
    expect(boundaries.redis.disconnect).toHaveBeenCalledOnce();
    expect(boundaries.s3.destroy).toHaveBeenCalledOnce();
  });

  it("bounds HTTP readiness when a dependency never responds", async () => {
    boundaries.redis.ping.mockReturnValueOnce(new Promise(() => {}));
    const { app, health } = await startHealth({ PORT: 0 }, postgresBoundary().prisma);
    try {
      const response = await httpGet(portOf(health), "/readyz?probe=railway");
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ checks: { redis: "failed" } });
    } finally {
      await app.close();
    }
  });

  it("admits maintenance deployments without dependency probes", async () => {
    const server = await startMaintenanceHealthServer(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      for (const path of ["/healthz", "/readyz"]) {
        const response = await httpGet(address.port, path);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: "maintenance", service: "worker", businessReady: false });
      }
      expect(Redis).not.toHaveBeenCalled();
      expect(S3Client).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves liveness without touching dependencies and exposes only safe metadata", async () => {
    vi.stubEnv("AUTOTM_COMMIT_SHA", "abc123");
    vi.stubEnv("APP_ENV", "staging");
    const { prisma, transaction } = postgresBoundary();
    const { app, health } = await startHealth({ PORT: 0 }, prisma);

    try {
      const response = await httpGet(portOf(health), "/healthz");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok", service: "worker", commitSha: "abc123", environment: "staging" });
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("returns 200 when Postgres, Redis and MinIO are healthy", async () => {
    const { app, health } = await startHealth({
      PORT: 0,
      REDIS_URL: "redis://healthy",
      MINIO_ENDPOINT: "http://healthy",
      MINIO_REGION: "us-east-1",
      MINIO_ACCESS_KEY: "key",
      MINIO_SECRET_KEY: "secret",
    }, postgresBoundary().prisma);

    try {
      const response = await httpGet(portOf(health), "/readyz");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: "ready", service: "worker", checks: { postgres: "ok", redis: "ok", minio: "ok" } });
    } finally {
      await app.close();
    }
  });

  it("returns 503 with per-check statuses when readiness is not satisfied", async () => {
    boundaries.redis.connect.mockRejectedValueOnce(new Error("redis://secret"));
    const { app, health } = await startHealth({
      PORT: 0,
      REDIS_URL: "redis://unhealthy",
      MINIO_ENDPOINT: "http://healthy",
      MINIO_REGION: "us-east-1",
      MINIO_ACCESS_KEY: "key",
      MINIO_SECRET_KEY: "secret",
    }, postgresBoundary().prisma);

    try {
      const response = await httpGet(portOf(health), "/readyz");
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ status: "not_ready", service: "worker", checks: { postgres: "ok", redis: "failed" } });
      expect(JSON.stringify(response.body)).not.toContain("secret");
    } finally {
      await app.close();
    }
  });

  it("releases the listener on shutdown", async () => {
    const { app, health } = await startHealth({ PORT: 0 }, postgresBoundary().prisma);
    const port = portOf(health);
    await app.close();
    await expect(httpGet(port, "/healthz")).rejects.toThrow();
  });
});
