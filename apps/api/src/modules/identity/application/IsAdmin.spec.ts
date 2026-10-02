import { describe, it, expect, beforeEach } from "vitest";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";

class FakeIdentityCheckAdapter implements IdentityCheckPort {
  private users = new Map<string, string>();

  setRole(userId: string, role: string): void {
    this.users.set(userId, role);
  }

  async isAdmin(userId: string): Promise<boolean> {
    return this.users.get(userId) === "admin";
  }

  async isInDealership(): Promise<boolean> {
    return false;
  }

  async isSuspended(): Promise<boolean> {
    return false;
  }

  async isDeletionScheduled(): Promise<boolean> {
    return false;
  }
}

describe("IdentityCheckPort.isAdmin", () => {
  let port: FakeIdentityCheckAdapter;

  beforeEach(() => {
    port = new FakeIdentityCheckAdapter();
  });

  it("returns true for admin", async () => {
    port.setRole("user-1", "admin");
    const result = await port.isAdmin("user-1");
    expect(result).toBe(true);
  });

  it("returns false for non-admin", async () => {
    port.setRole("user-2", "buyer");
    const result = await port.isAdmin("user-2");
    expect(result).toBe(false);
  });

  it("returns false for unknown user", async () => {
    const result = await port.isAdmin("user-unknown");
    expect(result).toBe(false);
  });
});
