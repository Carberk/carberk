import { describe, it, expect, vi } from "vitest";

import {
  runPromoteAdmin,
  type PromoteAdminDeps,
  type PromoteAdminOptions,
  type PromoteAdminTransaction,
} from "./promote-admin";

function createDeps(overrides?: Partial<PromoteAdminTransaction>) {
  const tx: PromoteAdminTransaction = {
    findUserByPhone: vi.fn().mockResolvedValue(null),
    findUsersByEmail: vi.fn().mockResolvedValue([]),
    updateUserRole: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const deps: PromoteAdminDeps = { transaction: (work) => work(tx) };
  return { ...tx, ...deps };
}

describe("runPromoteAdmin", () => {
  const validOptions: PromoteAdminOptions = {
    phone: "+99361234567",
    reason: "bootstrap first admin",
    dryRun: false,
  };

  it("returns error for invalid phone format", async () => {
    const deps = createDeps();
    const result = await runPromoteAdmin(deps, {
      ...validOptions,
      phone: "invalid",
    });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("Invalid phone format");
    expect(deps.findUserByPhone).not.toHaveBeenCalled();
  });

  it("returns error for empty reason after trim", async () => {
    const deps = createDeps();
    const result = await runPromoteAdmin(deps, {
      ...validOptions,
      reason: "   ",
    });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("Reason cannot be empty");
  });

  it("returns error for reason over 1000 chars", async () => {
    const deps = createDeps();
    const result = await runPromoteAdmin(deps, {
      ...validOptions,
      reason: "x".repeat(1001),
    });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("Reason cannot exceed 1000 characters");
  });

  it("returns non-zero when no user matches the phone", async () => {
    const deps = createDeps({
      findUserByPhone: vi.fn().mockResolvedValue(null),
    });
    const result = await runPromoteAdmin(deps, validOptions);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("No user found");
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  it("returns zero as no-op when user is already admin, without writing audit", async () => {
    const deps = createDeps({
      findUserByPhone: vi.fn().mockResolvedValue({ id: "user-1", role: "admin", emailVerifiedAt: null }),
    });
    const result = await runPromoteAdmin(deps, validOptions);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("already admin");
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  it("dry-run validates but writes nothing", async () => {
    const deps = createDeps({
      findUserByPhone: vi.fn().mockResolvedValue({ id: "user-1", role: "buyer", emailVerifiedAt: null }),
    });
    const result = await runPromoteAdmin(deps, {
      ...validOptions,
      dryRun: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("dry-run");
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  it("promotes user and writes correct audit row on success", async () => {
    let capturedDetails: Record<string, unknown> | undefined;
    const deps = createDeps({
      findUserByPhone: vi.fn().mockResolvedValue({ id: "user-1", role: "buyer", emailVerifiedAt: null }),
      createAuditLog: vi.fn(async (data) => {
        capturedDetails = data.details as Record<string, unknown>;
      }),
    });
    const result = await runPromoteAdmin(deps, validOptions);
    expect(result.exitCode).toBe(0);
    expect(deps.updateUserRole).toHaveBeenCalledWith("user-1", "admin");
    expect(deps.createAuditLog).toHaveBeenCalledTimes(1);
    expect(deps.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: "ADMIN_BOOTSTRAP_PROMOTE",
        targetType: "user",
        targetId: "user-1",
        details: expect.objectContaining({
          reason: "bootstrap first admin",
          before: { role: "buyer" },
          after: { role: "admin" },
        }),
      }),
    );

    expect(capturedDetails).toBeDefined();
    expect(capturedDetails).not.toHaveProperty("phone");
  });

  it("preserves internal line breaks in reason", async () => {
    const deps = createDeps({
      findUserByPhone: vi.fn().mockResolvedValue({ id: "user-1", role: "buyer", emailVerifiedAt: null }),
    });
    const reason = "Line 1\nLine 2\nLine 3";
    const result = await runPromoteAdmin(deps, { ...validOptions, reason });

    expect(result.exitCode).toBe(0);
    expect(deps.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ reason }),
      }),
    );
  });

  it.each([
    {},
    { phone: "+99361234567", email: "staff@example.test" },
    { phone: "", email: "staff@example.test" },
  ])("refuses invalid selector combinations without writes: %j", async (selector) => {
    const deps = createDeps();
    const result = await runPromoteAdmin(deps, { reason: "bootstrap", dryRun: false, ...selector });
    expect(result.exitCode).toBe(1);
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  const emailOptions: PromoteAdminOptions = {
    email: "  Coordinator@Campaign.Example.TEST  ", reason: "  email bootstrap  ", dryRun: false,
  };
  const verifiedHolder = { id: "email-user", role: "buyer", emailVerifiedAt: new Date("2026-10-20T00:00:00Z") };

  it("selects the canonical verified email holder and writes a contact-free receipt", async () => {
    const deps = createDeps({ findUsersByEmail: async (email) =>
      email === "coordinator@campaign.example.test" ? [verifiedHolder] : [],
    });
    expect(await runPromoteAdmin(deps, emailOptions)).toEqual({
      exitCode: 0, message: "Promoted user email-user to admin",
    });
    expect(deps.updateUserRole).toHaveBeenCalledWith("email-user", "admin");
    expect(deps.createAuditLog).toHaveBeenCalledWith({
      actorId: null, action: "ADMIN_BOOTSTRAP_PROMOTE", targetType: "user", targetId: "email-user",
      details: { reason: "email bootstrap", before: { role: "buyer" }, after: { role: "admin" } },
    });
  });

  it.each(["invalid", "", "x".repeat(250) + "@example.test"])("refuses malformed email %j", async (email) => {
    const deps = createDeps();
    expect((await runPromoteAdmin(deps, { ...emailOptions, email })).exitCode).toBe(1);
    expect(deps.findUsersByEmail).not.toHaveBeenCalled();
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    { holders: [] },
    { holders: [{ ...verifiedHolder, emailVerifiedAt: null }] },
    { holders: [verifiedHolder, { ...verifiedHolder, id: "legacy-holder" }] },
    { holders: [verifiedHolder, { ...verifiedHolder, id: "unverified-holder", emailVerifiedAt: null }] },
  ])("refuses absent, unverified or ambiguous email holders: %j", async ({ holders }) => {
    const deps = createDeps({ findUsersByEmail: async () => holders });
    expect((await runPromoteAdmin(deps, emailOptions)).exitCode).toBe(1);
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    { role: "buyer", dryRun: true, message: "[dry-run] Would promote user email-user to admin" },
    { role: "admin", dryRun: false, message: "User email-user is already admin" },
  ])("keeps email $role dryRun=$dryRun write-free", async ({ role, dryRun, message }) => {
    const deps = createDeps({ findUsersByEmail: async () => [{ ...verifiedHolder, role }] });
    expect(await runPromoteAdmin(deps, { ...emailOptions, dryRun })).toEqual({ exitCode: 0, message });
    expect(deps.updateUserRole).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
  });

  it.each([validOptions, emailOptions])("propagates refused audit so the transaction cannot commit: %j", async (options) => {
    const deps = createDeps({
      findUsersByEmail: async () => [verifiedHolder],
      findUserByPhone: async () => verifiedHolder,
      createAuditLog: async () => { throw new Error("audit refused"); },
    });
    await expect(runPromoteAdmin(deps, options)).rejects.toThrow("audit refused");
  });
});

it.each(["phone", "email"] as const)("refuses unsupported %s role promotion before role or audit effects", async (selector) => {
  const user = { id: "finite-user", role: "buyer", emailVerifiedAt: new Date("2026-10-26T00:00:00Z") };
  const state = { user, audits: [] as unknown[] };
  const before = structuredClone(state);
  const deps = createDeps({
    findUserByPhone: async () => user,
    findUsersByEmail: async () => [user],
    updateUserRole: async () => { user.role = "admin"; },
    createAuditLog: async (audit) => { state.audits.push(audit); },
  });
  const result = await runPromoteAdmin(deps, {
    ...(selector === "phone" ? { phone: "+99361234567" } : { email: "finite@example.test" }),
    reason: "finite maintenance", dryRun: false,
  });
  expect(result.exitCode).toBe(1);
  expect(result.message).toContain("unsupported User.role promotion");
  expect(state).toEqual(before);
});
