import "reflect-metadata";

import { describe, it, expect, beforeEach } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AccountDeletionPendingGuard } from "./account-deletion-pending.guard";
import { AllowPendingDeletion } from "./allow-pending-deletion.decorator";
import { Public } from "./public.decorator";
import type { IdentityCheckPort } from "../modules/identity/identity.public";

class FakeIdentityCheckPort implements IdentityCheckPort {
  pending = new Set<string>();
  lookups = 0;

  async isAdmin(): Promise<boolean> {
    return false;
  }
  async isInDealership(): Promise<boolean> {
    return false;
  }
  async isSuspended(): Promise<boolean> {
    return false;
  }
  async isDeletionScheduled(userId: string): Promise<boolean> {
    this.lookups += 1;
    return this.pending.has(userId);
  }
}

class Routes {
  mutate(): void {}

  @AllowPendingDeletion()
  restore(): void {}

  @Public()
  open(): void {}
}

function makeContext(
  handler: () => void,
  method: string,
  user?: { sub?: string },
): ExecutionContext {
  return {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({
      getRequest: () => ({ method, user }),
    }),
  } as unknown as ExecutionContext;
}

describe("AccountDeletionPendingGuard", () => {
  let identity: FakeIdentityCheckPort;
  let guard: AccountDeletionPendingGuard;
  const routes = new Routes();

  beforeEach(() => {
    identity = new FakeIdentityCheckPort();
    identity.pending.add("pending-user");
    guard = new AccountDeletionPendingGuard(new Reflector(), identity);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "refuses a %s from a User whose deletion is scheduled",
    async (method) => {
      const attempt = guard.canActivate(
        makeContext(routes.mutate, method, { sub: "pending-user" }),
      );

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await attempt.catch((err: ForbiddenException) => {
        expect(err.getResponse()).toMatchObject({
          code: "FORBIDDEN",
          details: { reason: "ACCOUNT_DELETION_PENDING" },
        });
      });
    },
  );

  it("lets a User whose deletion is scheduled read", async () => {
    await expect(
      guard.canActivate(makeContext(routes.mutate, "GET", { sub: "pending-user" })),
    ).resolves.toBe(true);
  });

  it("lets a User whose deletion is scheduled call a route that allows it", async () => {
    await expect(
      guard.canActivate(
        makeContext(routes.restore, "POST", { sub: "pending-user" }),
      ),
    ).resolves.toBe(true);
  });

  it("lets a User with no scheduled deletion mutate", async () => {
    await expect(
      guard.canActivate(makeContext(routes.mutate, "POST", { sub: "active-user" })),
    ).resolves.toBe(true);
  });

  it("ignores public routes and requests with no signed-in User", async () => {
    await expect(
      guard.canActivate(makeContext(routes.open, "POST", { sub: "pending-user" })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(makeContext(routes.mutate, "POST")),
    ).resolves.toBe(true);
  });

  it("does not look the User up for reads", async () => {
    await guard.canActivate(
      makeContext(routes.mutate, "GET", { sub: "pending-user" }),
    );

    expect(identity.lookups).toBe(0);
  });
});
