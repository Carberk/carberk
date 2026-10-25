import { createHash } from "node:crypto";
import type { PrismaService } from "@auto-tm/db";
import { describe, expect, it } from "vitest";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import { PrismaOtpRequestRepository } from "./PrismaOtpRequestRepository";

const now = new Date("2026-10-20T12:00:00Z");
const requestId = "00000000-0000-4000-8000-000000000001";
const carrier = { kind: "campaign", namespace: `cf_${"e1".repeat(16)}`, reservationId: "e1".repeat(16),
  candidate: "a".repeat(40), requestId };
const input = { purpose: "listing-contact-phone" as const, destination: signInCodeDestination({ phone: "+99367752052" }),
  codeHash: createHash("sha256").update("709814").digest("hex"), userId: "owner", businessId: "business", ip: "10.0.0.1" };

// The storage transport supplies INSERT/setting/authority responses. This does
// not emulate a trigger or prove PostgreSQL transaction and lock behavior.
function repository(marker: string, admitted = true, lookupError?: Error) {
  let setting = "poisoned pooled setting";
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async (query: TemplateStringsArray) => {
      const sql = query.join("");
      if (sql.includes("campaign_prepare")) return [{ receipt: "ordinary-prelude" }];
      if (sql.includes("set_config")) { setting = ""; return []; }
      if (sql.includes("current_setting")) return [{ binding: setting }];
      return [];
    },
    $queryRawUnsafe: async () => {
      if (lookupError) throw lookupError;
      return [{ admitted }];
    },
    otpRequest: {
      count: async () => 0,
      findFirst: async () => null,
      create: async () => {
        if (marker) setting = marker;
        return { id: requestId, purpose: "listing_contact_phone", channel: "phone", destination: input.destination.value,
          phone: input.destination.value, codeHash: input.codeHash, userId: input.userId, businessId: input.businessId,
          ip: input.ip, attempts: 0, verifiedAt: null, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 300000) };
      },
    },
  };
  return new PrismaOtpRequestRepository({ $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx) } as unknown as PrismaService);
}

describe("PrismaOtpRequestRepository SMS admission", () => {
  it("returns the exact database-attested full-request carrier with the ordinary reservation", async () => {
    const result = await repository(JSON.stringify(carrier)).reserve(input, { now: () => now });
    expect(result.smsDelivery).toEqual(carrier);
    expect(result.record).toMatchObject({ id: requestId, purpose: "listing-contact-phone", destination: "+99367752052" });
    expect(result.resendInSeconds).toBeGreaterThan(0);
  });

  it("clears a pooled marker and returns ordinary admission only after a successful unmarked INSERT", async () => {
    expect((await repository("").reserve(input, { now: () => now })).smsDelivery).toEqual({ kind: "ordinary" });
  });

  it.each([
    "{", "null", "[]", JSON.stringify({ ...carrier, candidate: "A".repeat(40) }),
    JSON.stringify({ ...carrier, namespace: "public" }), JSON.stringify({ ...carrier, requestId: "foreign" }),
    JSON.stringify({ ...carrier, extra: "unsupported" }),
  ])("never downgrades malformed attestation %s to ordinary", async marker => {
    await expect(repository(marker).reserve(input, { now: () => now })).rejects.toThrow();
  });

  it("refuses missing exact durable authority and storage lookup failure without ordinary fallback", async () => {
    await expect(repository(JSON.stringify(carrier), false).reserve(input, { now: () => now })).rejects.toThrow("SMS delivery binding refused");
    await expect(repository(JSON.stringify(carrier), true, new Error("storage unavailable")).reserve(input, { now: () => now })).rejects.toThrow("storage unavailable");
  });
});
