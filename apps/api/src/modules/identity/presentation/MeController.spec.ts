import "reflect-metadata";

import { describe, it, expect, vi } from "vitest";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { MeController } from "./MeController";

const ME = {
  id: "user-1",
  phone: "+99361234567",
  email: null,
  phoneVerified: true,
  displayName: null,
  role: "buyer",
  avatarUrl: null,
  locale: "ru",
  createdAt: "2026-05-14T12:00:00.000Z",
  deletionScheduledAt: null,
};

function build() {
  const calls: string[] = [];
  const getMe = {
    execute: vi.fn(async () => {
      calls.push("getMe");
      return ME;
    }),
  };
  const recoverAccount = {
    execute: vi.fn(async () => {
      calls.push("recover");
    }),
  };
  const unused = { execute: vi.fn() };
  const controller = new MeController(
    getMe as never,
    unused as never,
    unused as never,
    unused as never,
    unused as never,
    unused as never,
    unused as never,
    recoverAccount as never,
  );
  return { calls, controller, getMe, recoverAccount };
}

function requestFor(sub?: string): FastifyRequest {
  return { user: sub ? { sub } : undefined } as unknown as FastifyRequest;
}

describe("MeController POST /api/v1/me/restore", () => {
  it("restores the signed-in User's account and answers with /me", async () => {
    const { calls, controller, recoverAccount } = build();

    const result = await controller.restore(requestFor("user-1"));

    expect(recoverAccount.execute).toHaveBeenCalledWith({ userId: "user-1" });
    expect(calls).toEqual(["recover", "getMe"]);
    expect(result).toEqual(ME);
  });

  it("answers 404 when the User no longer exists", async () => {
    const { controller, recoverAccount } = build();
    recoverAccount.execute.mockRejectedValueOnce(new Error("User not found"));

    await expect(controller.restore(requestFor("user-1"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("answers 401 without a signed-in User", async () => {
    const { controller, recoverAccount } = build();

    await expect(controller.restore(requestFor())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(recoverAccount.execute).not.toHaveBeenCalled();
  });
});
