import type { Env } from "../../../env.schema";
import { ConfigService } from "@nestjs/config";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import "reflect-metadata";

import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { GetMe } from "../application/GetMe";
import { UpdateDisplayName } from "../application/UpdateDisplayName";
import { InMemoryIdentityCheck } from "../application/testing/InMemoryIdentityCheck";
import { InMemoryUsers } from "../application/testing/InMemoryUsers";
import { MeController } from "./MeController";

function requestFor(sub?: string): FastifyRequest {
  return { user: sub ? { sub } : undefined } as unknown as FastifyRequest;
}

function responseOf(error: unknown): unknown {
  return (error as HttpException).getResponse();
}

describe("MeController PATCH /api/v1/me", () => {
  let users: InMemoryUsers;
  let identityCheck: InMemoryIdentityCheck;
  let controller: MeController;

  beforeEach(() => {
    users = new InMemoryUsers();
    identityCheck = new InMemoryIdentityCheck();
    users.seed({ id: "user-1", phone: "+99365180518", nameNumber: 4821, avatarIndex: 7 });
    const unused = {} as never;
    controller = new MeController(
      new GetMe(users, new ConfigListingVideoAccess(new ConfigService<Env, true>({ LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "", LISTING_VIDEO_VIEW_TESTER_USER_IDS: "", LISTING_VIDEO_UPLOADS_ENABLED: false })), identityCheck),
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      new UpdateDisplayName(users, identityCheck),
    );
  });

  it("stores the name and answers with the same shape as GET /me", async () => {
    const patched = await controller.update(requestFor("user-1"), {
      displayName: "  Aman   Durdy ",
    });

    expect(patched).toEqual({
      id: "user-1",
      phone: "+99365180518",
      email: null,
      phoneVerified: true,
      displayName: "Aman Durdy",
      nameNumber: 4821,
      avatarIndex: 7,
      avatarKey: null,
      role: "buyer",
      avatarUrl: null,
      locale: "ru",
      createdAt: "2026-05-01T00:00:00.000Z",
      deletionScheduledAt: null,
      isVideoUploadTester: false,
      canUploadVideo: false,
    });
    expect(await controller.me(requestFor("user-1"))).toEqual(patched);
  });

  it("ignores other fields in the body", async () => {
    const patched = await controller.update(requestFor("user-1"), {
      displayName: "Aman",
      nameNumber: 1,
      avatarIndex: 0,
      avatarKey: "uploads/x.jpg",
      phone: "+99365000000",
      role: "admin",
    });

    expect(patched).toMatchObject({
      displayName: "Aman",
      nameNumber: 4821,
      avatarIndex: 7,
      avatarKey: null,
      phone: "+99365180518",
      role: "buyer",
    });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["A", "too_short"],
    ["a".repeat(31), "too_long"],
  ])("refuses %j with 400 INVALID_DISPLAY_NAME, reason %s, and stores nothing", async (raw, reason) => {
    const error = await controller
      .update(requestFor("user-1"), { displayName: raw })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(responseOf(error)).toEqual({
      code: "INVALID_DISPLAY_NAME",
      message: "The name does not meet the rule.",
      details: { reason },
    });
    expect((await controller.me(requestFor("user-1"))).displayName).toBeNull();
  });

  it("answers 400 VALIDATION_FAILED when the name is missing or not text", async () => {
    for (const body of [{}, { displayName: 12 }, null]) {
      const error = await controller
        .update(requestFor("user-1"), body)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(responseOf(error)).toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });

  it("refuses a suspended User with 403 and the suspension reason", async () => {
    identityCheck.suspend("user-1");

    const error = await controller
      .update(requestFor("user-1"), { displayName: "Aman" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(responseOf(error)).toEqual({
      code: "FORBIDDEN",
      message: "User is suspended",
      details: { reason: "USER_SUSPENDED" },
    });
    expect((await controller.me(requestFor("user-1"))).displayName).toBeNull();
  });

  describe("logging", () => {
    const NAME = "Zzqx Secretname";
    const LEVELS = ["log", "warn", "error", "debug", "verbose", "fatal"] as const;
    let calls: unknown[][];

    beforeEach(() => {
      calls = [];
      const record = (...args: unknown[]) => { calls.push(args); };
      for (const level of LEVELS) {
        vi.spyOn(Logger.prototype, level).mockImplementation(record);
        vi.spyOn(Logger, level).mockImplementation(record);
      }
      for (const level of ["log", "info", "warn", "error", "debug"] as const) {
        vi.spyOn(console, level).mockImplementation(record);
      }
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never logs the name, saved or refused", async () => {
      await controller.update(requestFor("user-1"), { displayName: NAME });
      await controller.update(requestFor("user-1"), { displayName: `${NAME} ${"x".repeat(30)}` })
        .catch(() => undefined);
      identityCheck.suspend("user-1");
      await controller.update(requestFor("user-1"), { displayName: NAME }).catch(() => undefined);

      // `inspect` keeps an Error's message, which `JSON.stringify` drops.
      expect(calls.flat().map((arg) => inspect(arg)).join("\n")).not.toContain("Secretname");
    });
  });

  it("answers 401 without a signed-in User", async () => {
    await expect(
      controller.update(requestFor(), { displayName: "Aman" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
