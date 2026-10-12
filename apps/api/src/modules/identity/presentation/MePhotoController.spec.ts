import "reflect-metadata";

import { beforeEach, describe, expect, it } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  RequestMethod,
  UnauthorizedException,
} from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { FastifyRequest } from "fastify";

import { GetMe } from "../application/GetMe";
import { RemoveProfilePhoto } from "../application/RemoveProfilePhoto";
import { SetProfilePhoto } from "../application/SetProfilePhoto";
import { InMemoryIdentityCheck } from "../application/testing/InMemoryIdentityCheck";
import { InMemoryProfilePhotos } from "../application/testing/InMemoryProfilePhotos";
import { InMemoryUsers } from "../application/testing/InMemoryUsers";
import { MePhotoController } from "./MePhotoController";

const KEY = "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp";

function requestFor(sub?: string): FastifyRequest {
  return { user: sub ? { sub } : undefined } as unknown as FastifyRequest;
}

function responseOf(error: unknown): unknown {
  return (error as HttpException).getResponse();
}

describe("MePhotoController /api/v1/me/photo", () => {
  let users: InMemoryUsers;
  let identityCheck: InMemoryIdentityCheck;
  let photos: InMemoryProfilePhotos;
  let getMe: GetMe;
  let controller: MePhotoController;

  beforeEach(() => {
    users = new InMemoryUsers();
    identityCheck = new InMemoryIdentityCheck();
    photos = new InMemoryProfilePhotos(users);
    users.seed({ id: "user-1", phone: "+99365180518", nameNumber: 4821, avatarIndex: 7 });
    getMe = new GetMe(users);
    controller = new MePhotoController(
      getMe,
      new SetProfilePhoto(users, identityCheck, photos),
      new RemoveProfilePhoto(users, identityCheck, photos),
    );
  });

  it("serves PUT and DELETE on api/v1/me/photo, both answering 200", () => {
    expect(Reflect.getMetadata(PATH_METADATA, MePhotoController)).toBe("api/v1/me/photo");
    const { set, remove } = MePhotoController.prototype;
    expect(Reflect.getMetadata(METHOD_METADATA, set)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata(METHOD_METADATA, remove)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, set)).toBe(200);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, remove)).toBe(200);
  });

  describe("PUT", () => {
    it("sets the photo and answers with the same shape as GET /me", async () => {
      const answer = await controller.set(requestFor("user-1"), { key: KEY });

      expect(answer).toEqual({
        id: "user-1",
        phone: "+99365180518",
        email: null,
        phoneVerified: true,
        displayName: null,
        nameNumber: 4821,
        avatarIndex: 7,
        avatarKey: KEY,
        role: "buyer",
        avatarUrl: null,
        locale: "ru",
        createdAt: "2026-05-01T00:00:00.000Z",
        deletionScheduledAt: null,
      });
      expect(await getMe.execute({ userId: "user-1" })).toEqual(answer);
    });

    it("reads only the key from the body", async () => {
      const answer = await controller.set(requestFor("user-1"), {
        key: KEY,
        avatarIndex: 0,
        userId: "user-2",
      });

      expect(answer).toMatchObject({ id: "user-1", avatarKey: KEY, avatarIndex: 7 });
      expect(photos.adopted).toEqual([{ userId: "user-1", key: KEY }]);
    });

    it("answers 400 VALIDATION_FAILED when the key is missing, empty or not text", async () => {
      for (const body of [{}, { key: "" }, { key: 12 }, null]) {
        const error = await controller.set(requestFor("user-1"), body).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(responseOf(error)).toMatchObject({ code: "VALIDATION_FAILED" });
      }
      expect(photos.adopted).toEqual([]);
    });

    it("passes the upload boundary's refusal on unchanged", async () => {
      photos.refusal = new BadRequestException({
        code: "UPLOAD_NOT_AVAILABLE",
        message: "Upload is not available for this User",
      });

      const error = await controller.set(requestFor("user-1"), { key: KEY }).catch((e: unknown) => e);

      expect(error).toBe(photos.refusal);
      expect((await getMe.execute({ userId: "user-1" })).avatarKey).toBeNull();
    });

    it("refuses a suspended User with 403 and the suspension reason", async () => {
      identityCheck.suspend("user-1");

      const error = await controller.set(requestFor("user-1"), { key: KEY }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(responseOf(error)).toEqual({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: "USER_SUSPENDED" },
      });
      expect((await getMe.execute({ userId: "user-1" })).avatarKey).toBeNull();
    });

    it("answers 401 without a signed-in User", async () => {
      await expect(controller.set(requestFor(), { key: KEY })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("DELETE", () => {
    it("removes the photo and answers /me with avatarKey null and the same avatar index", async () => {
      await controller.set(requestFor("user-1"), { key: KEY });

      const answer = await controller.remove(requestFor("user-1"));

      expect(answer).toMatchObject({ id: "user-1", avatarKey: null, avatarIndex: 7 });
      expect(await getMe.execute({ userId: "user-1" })).toEqual(answer);
    });

    it("succeeds for a User with no photo", async () => {
      const answer = await controller.remove(requestFor("user-1"));

      expect(answer).toMatchObject({ id: "user-1", avatarKey: null, avatarIndex: 7 });
    });

    it("refuses a suspended User with 403 and keeps the photo", async () => {
      await controller.set(requestFor("user-1"), { key: KEY });
      identityCheck.suspend("user-1");

      const error = await controller.remove(requestFor("user-1")).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(responseOf(error)).toMatchObject({ details: { reason: "USER_SUSPENDED" } });
      expect((await getMe.execute({ userId: "user-1" })).avatarKey).toBe(KEY);
    });

    it("answers 401 without a signed-in User", async () => {
      await expect(controller.remove(requestFor())).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
