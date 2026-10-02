import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";

import { UploadsController } from "./UploadsController";
import { PresignUpload } from "../application/PresignUpload";
import { MEDIA_STORAGE_PORT } from "../domain/ports/MediaStoragePort";
import { MEDIA_UPLOAD_REPOSITORY } from "../domain/ports/MediaUploadRepository";
import type { NewMediaUpload } from "../domain/MediaUpload";
import { IdentityModule } from "../../identity/identity.module";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";

class FakeMediaStorage {
  async presignUpload(data: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expirySeconds?: number;
  }): Promise<{ url: string; key: string }> {
    return {
      url: `https://media.auto.tm/presigned/${data.key}`,
      key: data.key,
    };
  }

  resolvePublicUrl(_key: string): string {
    return `https://media.auto.tm/${_key}`;
  }
}

class FakeMediaUploadRepository {
  recorded: NewMediaUpload[] = [];

  async record(upload: NewMediaUpload): Promise<void> {
    this.recorded.push(upload);
  }

  async findByKeys(): Promise<[]> {
    return [];
  }
}

describe("UploadsController e2e", () => {
  const uploads = new FakeMediaUploadRepository();
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
      controllers: [UploadsController],
      providers: [
        PresignUpload,
        {
          provide: MEDIA_STORAGE_PORT,
          useClass: FakeMediaStorage,
        },
        { provide: MEDIA_UPLOAD_REPOSITORY, useValue: uploads },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  function getToken(): string {
    return mintUserJwt("user-1");
  }

  describe("POST /api/v1/uploads/presign", () => {
    it("returns 401 without bearer token", async () => {
      await request
        .post("/api/v1/uploads/presign")
        .send({ kind: "image", contentType: "image/jpeg", sizeBytes: 1024 })
        .expect(401);
    });

    it("returns presigned URL for image", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ kind: "image", contentType: "image/jpeg", sizeBytes: 1024 })
        .expect(201);

      expect(res.body.uploadUrl).toContain("presigned");
      expect(res.body.key).toContain("pending/");
      expect(res.body.key).toMatch(/original\.jpg$/);
      expect(res.body.expiresIn).toBe(600);
      expect(res.body.maxSizeBytes).toBe(5 * 1024 * 1024);
    });

    it("records the upload for the calling User", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ kind: "image", contentType: "image/jpeg", sizeBytes: 2048 })
        .expect(201);

      expect(uploads.recorded.find((u) => u.key === res.body.key)).toMatchObject({
        userId: "user-1",
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });
    });

    it("returns presigned URL for video", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ kind: "video", contentType: "video/mp4", sizeBytes: 1024 })
        .expect(201);

      expect(res.body.key).toMatch(/original\.mp4$/);
      expect(res.body.maxSizeBytes).toBe(10 * 1024 * 1024);
    });

    it("returns webp extension for image/webp", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ kind: "image", contentType: "image/webp", sizeBytes: 1024 })
        .expect(201);

      expect(res.body.key).toMatch(/original\.webp$/);
    });

    it("rejects unsupported content type", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ kind: "image", contentType: "image/png", sizeBytes: 1024 })
        .expect(400);

      expect(res.body.code).toBe("HTTP_ERROR");
    });

    it("rejects oversized image", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({
          kind: "image",
          contentType: "image/jpeg",
          sizeBytes: 6 * 1024 * 1024,
        })
        .expect(400);

      expect(res.body.code).toBe("HTTP_ERROR");
    });

    it("rejects oversized video", async () => {
      const res = await request
        .post("/api/v1/uploads/presign")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({
          kind: "video",
          contentType: "video/mp4",
          sizeBytes: 11 * 1024 * 1024,
        })
        .expect(400);

      expect(res.body.code).toBe("HTTP_ERROR");
    });
  });
});
