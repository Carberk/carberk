import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import type { PrismaService } from "@auto-tm/db";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import type { Env } from "../env.schema";

import { runReadinessChecks, type ReadinessCheck } from "./readiness";

const READINESS_CHECK_TIMEOUT_MS = 1_500;

export const WORKER_HEALTH_DEPENDENCIES = Symbol("WORKER_HEALTH_DEPENDENCIES");

export type WorkerHealthDependencies = {
  postgres: ReadinessCheck;
  redis: ReadinessCheck;
  minio: ReadinessCheck;
};

// Mirrors the API deploy metadata; worker runtime must not import from the API.
function getDeployMetadata(env: NodeJS.ProcessEnv): {
  commitSha: string;
  environment: string;
} {
  return {
    commitSha: env["AUTOTM_COMMIT_SHA"] ?? env["RAILWAY_GIT_COMMIT_SHA"] ?? "unknown",
    environment: env["RAILWAY_ENVIRONMENT_NAME"] ?? env["APP_ENV"] ?? "development",
  };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

/** Admit the maintenance replacement without starting application providers or consumers. */
export async function startMaintenanceHealthServer(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://worker").pathname;
    } catch {
      writeJson(response, 400, { status: "bad_request" });
      return;
    }
    if (request.method !== "GET") {
      writeJson(response, 405, { status: "method_not_allowed" });
    } else if (pathname !== "/healthz" && pathname !== "/readyz") {
      writeJson(response, 404, { status: "not_found" });
    } else {
      writeJson(response, 200, { status: "maintenance", service: "worker", businessReady: false, ...getDeployMetadata(process.env) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => { server.off("error", reject); resolve(); });
  });
  return server;
}

export function createWorkerHealthDependencies(
  config: ConfigService<Env, true>,
  prisma: PrismaService,
): WorkerHealthDependencies {
  return {
    postgres: async () => {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL statement_timeout = ${READINESS_CHECK_TIMEOUT_MS}`);
        await transaction.$queryRaw`SELECT 1`;
      }, { maxWait: READINESS_CHECK_TIMEOUT_MS, timeout: READINESS_CHECK_TIMEOUT_MS });
    },
    redis: async () => {
      const redis = new Redis(config.get("REDIS_URL", { infer: true }), {
        lazyConnect: true,
        connectTimeout: READINESS_CHECK_TIMEOUT_MS,
        commandTimeout: READINESS_CHECK_TIMEOUT_MS,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      redis.on("error", () => undefined);
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        redis.disconnect();
      }
    },
    minio: async () => {
      const s3 = new S3Client({
        endpoint: config.get("MINIO_ENDPOINT", { infer: true }),
        region: config.get("MINIO_REGION", { infer: true }),
        credentials: {
          accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }),
          secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }),
        },
        forcePathStyle: true,
      });
      try {
        await s3.send(new ListBucketsCommand({}), {
          abortSignal: AbortSignal.timeout(READINESS_CHECK_TIMEOUT_MS),
        });
      } finally {
        s3.destroy();
      }
    },
  };
}

@Injectable()
export class WorkerHealthServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHealthServer.name);
  private server: Server | undefined;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(WORKER_HEALTH_DEPENDENCIES) private readonly dependencies: WorkerHealthDependencies,
  ) {}

  async onModuleInit(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch(() => response.destroy());
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error("worker health server was not created"));
        return;
      }
      server.once("error", reject);
      server.listen(this.config.get("PORT", { infer: true }), "0.0.0.0", () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** The bound address is used by local probes; Railway still uses PORT. */
  address(): ReturnType<Server["address"]> {
    return this.server?.address() ?? null;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "GET") {
      writeJson(response, 405, { status: "method_not_allowed" });
      return;
    }
    const pathname = new URL(request.url ?? "/", "http://worker").pathname;
    if (pathname === "/healthz") {
      writeJson(response, 200, {
        status: "ok",
        service: "worker",
        ...getDeployMetadata(process.env),
      });
      return;
    }
    if (pathname !== "/readyz") {
      writeJson(response, 404, { status: "not_found" });
      return;
    }

    const result = await runReadinessChecks({ ...this.dependencies }, READINESS_CHECK_TIMEOUT_MS);
    if (!result.ready) {
      this.logger.warn(`Readiness failed: ${JSON.stringify(result.checks)}`);
    }
    writeJson(response, result.ready ? 200 : 503, {
      status: result.ready ? "ready" : "not_ready",
      service: "worker",
      checks: result.checks,
      ...getDeployMetadata(process.env),
    });
  }

}
