import { createHash } from "node:crypto";

import type { PrismaService } from "@auto-tm/db";
import type { OtpSms } from "../domain/ports/OtpSenderPort";
import { Logger } from "@nestjs/common";

import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpOtpSenderAdapter } from "./HttpOtpSenderAdapter";

// The code is deliberately not a suffix of the phone: a code that shares
// digits with the mask would let a masking regression pass by coincidence.
const sms = {
  smsDelivery: { kind: "ordinary" as const },
  phone: "+99365123456",
  code: "709814",
  purpose: "listing-contact-phone" as const,
  locale: "ru" as const,
  requestId: "00000000-0000-4000-8000-000000000001",
};

function makeAdapter() {
  const prisma = { otpRequest: { findUnique: async ({ where }: { where: { id: string } }) => ({
    channel: "phone", destination: where.id.startsWith("bbbbbbbb") ? "+99361003456" : sms.phone, phone: where.id.startsWith("bbbbbbbb") ? "+99361003456" : sms.phone,
    codeHash: createHash("sha256").update(sms.code).digest("hex"),
    verifiedAt: null, expiresAt: new Date("2099-01-01"), purpose: "listing_contact_phone",
  }) } } as unknown as PrismaService;
  return new HttpOtpSenderAdapter(prisma, { now: () => new Date("2026-10-20T12:00:00Z") });
}

describe("HttpOtpSenderAdapter", () => {
  const driver = process.env["SMS_DRIVER"];
  const candidate = process.env["AUTOTM_COMMIT_SHA"];
  afterEach(() => {
    vi.restoreAllMocks();
    if (candidate === undefined) delete process.env["AUTOTM_COMMIT_SHA"];
    else process.env["AUTOTM_COMMIT_SHA"] = candidate;
    if (driver === undefined) delete process.env["SMS_DRIVER"];
    else process.env["SMS_DRIVER"] = driver;
  });

  it("refuses missing internal delivery metadata without logging", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    await expect(makeAdapter().send({ ...sms, smsDelivery: undefined } as unknown as OtpSms)).rejects.toThrow("SMS delivery metadata refused");
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses an ordinary admission whose request disappeared without logging", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const db = { otpRequest: { findUnique: async () => null } } as unknown as PrismaService;
    const sender = new HttpOtpSenderAdapter(db, { now: () => new Date("2026-10-20T12:00:00Z") });
    await expect(sender.send(sms)).rejects.toThrow("SMS request unavailable");
    expect(log).not.toHaveBeenCalled();
  });

  const campaign = {
    ...sms,
    phone: "+99367752052",
    smsDelivery: { kind: "campaign" as const, reservationId: "e1".repeat(16), candidate: "a".repeat(40),
      namespace: `cf_${"e1".repeat(16)}`, requestId: sms.requestId },
  };

  // Only the database transport is faked. These controls prove adapter decisions,
  // not SQL execution, trigger acceptance or two-connection fence scheduling.
  function campaignStorage() {
    const sink = new Map<string, string>();
    const state = { admitted: true, loseResponse: false };
    const tx = {
      $queryRaw: async () => [],
      $queryRawUnsafe: async (sql: string, request: string, phone?: string, hash?: string, candidate?: string) =>
        sql.startsWith("SELECT message") ? (sink.has(request) ? [{ message: sink.get(request) }] : []) :
          [{ admitted: state.admitted && request === campaign.requestId && phone === campaign.phone &&
            hash === createHash("sha256").update(campaign.code).digest("hex") && candidate === campaign.smsDelivery.candidate }],
      $executeRawUnsafe: async (_sql: string, request: string, message: string) => {
        if (!sink.has(request)) sink.set(request, message);
      },
    };
    const db = { $transaction: async (action: (transaction: typeof tx) => Promise<void>) => {
      await action(tx);
      if (state.loseResponse) { state.loseResponse = false; throw new Error("response lost"); }
    } } as unknown as PrismaService;
    return { sink, state, sender: new HttpOtpSenderAdapter(db, { now: () => new Date("2026-10-20T12:00:00Z") }) };
  }

  it("retains one exact rendered SMS across a lost response and identical retry without logs", async () => {
    process.env["AUTOTM_COMMIT_SHA"] = campaign.smsDelivery.candidate;
    process.env["SMS_DRIVER"] = "mock";
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const { sender, sink, state } = campaignStorage();
    state.loseResponse = true;
    await expect(sender.send(campaign)).rejects.toThrow("response lost");
    expect([...sink.values()]).toEqual(["Carberk 709814: номер будет в объявлении. Не давайте код без согласия"]);
    await sender.send(campaign);
    expect(sink.size).toBe(1);
    await expect(sender.send({ ...campaign, locale: "en" })).rejects.toThrow("Campaign SMS content changed");
    expect([...sink.values()]).toEqual(["Carberk 709814: номер будет в объявлении. Не давайте код без согласия"]);
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses a delayed carrier when storage reports terminal or missing authority without resurrecting a sink", async () => {
    process.env["AUTOTM_COMMIT_SHA"] = campaign.smsDelivery.candidate;
    process.env["SMS_DRIVER"] = "mock";
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const { sender, sink, state } = campaignStorage();
    state.admitted = false;
    await expect(sender.send(campaign)).rejects.toThrow("Campaign SMS delivery refused");
    expect(sink.size).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses changed candidate, destination, request, code and non-mock delivery without fallback", async () => {
    process.env["AUTOTM_COMMIT_SHA"] = campaign.smsDelivery.candidate;
    process.env["SMS_DRIVER"] = "mock";
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const { sender, sink } = campaignStorage();
    for (const changed of [
      { ...campaign, phone: "+99361144468" }, { ...campaign, code: "111111" },
      { ...campaign, requestId: "aaaaaaaa-0000-4000-8000-000000000001" },
      { ...campaign, smsDelivery: { ...campaign.smsDelivery, candidate: "b".repeat(40) } },
      { ...campaign, smsDelivery: { ...campaign.smsDelivery, namespace: "public" } },
      { ...campaign, purpose: "sign-in" as const },
    ]) await expect(sender.send(changed)).rejects.toThrow("Campaign SMS delivery refused");
    process.env["SMS_DRIVER"] = "gateway";
    await expect(campaignStorage().sender.send(campaign)).rejects.toThrow("Campaign SMS delivery refused");
    expect(sink.size).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("builds the sms-gateway body { phone, body, requestId } with the rendered text", () => {
    expect(makeAdapter().gatewayRequest(sms)).toEqual({
      phone: "+99365123456",
      body: "Carberk 709814: номер будет в объявлении. Не давайте код без согласия",
      requestId: sms.requestId,
    });
  });

  it("renders the text in the seller's locale", () => {
    expect(makeAdapter().gatewayRequest({ ...sms, locale: "en" }).body).toBe(
      "Carberk code 709814 puts this number on a car listing. Share it only if you agree.",
    );
  });

  it.each(["mock", "gateway"])("still only logs in %s mode", async (mode) => {
    process.env["SMS_DRIVER"] = mode;
    await expect(makeAdapter().send(sms)).resolves.toBeUndefined();
  });

  it.each(["mock", "gateway"])(
    "writes only the last four digits of the phone number to the log in %s mode",
    async (mode) => {
      process.env["SMS_DRIVER"] = mode;
      const lines: string[] = [];
      vi.spyOn(Logger.prototype, "log").mockImplementation((line: unknown) => {
        lines.push(String(line));
      });

      await makeAdapter().send(sms);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("***3456");
      expect(lines[0]).not.toContain("+99365123456");
      expect(lines[0]).not.toContain("65123456");
    },
  );

  it("keeps the code in the mock log line, which is how a code is read where no SMS is sent", async () => {
    process.env["SMS_DRIVER"] = "mock";
    const lines: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    await makeAdapter().send(sms);

    // The tag is the start of the code request's own id, which the caller
    // also receives: it tells same-last-four requests apart without the phone.
    expect(lines).toEqual(["[mock] OTP for ***3456 (req 00000000): 709814"]);
  });

  it("tells two phones that share their last four digits apart by the request, not by the phone", async () => {
    process.env["SMS_DRIVER"] = "mock";
    const lines: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const adapter = makeAdapter();

    await adapter.send({ ...sms, phone: "+99365123456", requestId: "aaaaaaaa-0000-4000-8000-000000000001" });
    await adapter.send({ ...sms, phone: "+99361003456", requestId: "bbbbbbbb-0000-4000-8000-000000000002" });

    expect(lines).toEqual([
      "[mock] OTP for ***3456 (req aaaaaaaa): 709814",
      "[mock] OTP for ***3456 (req bbbbbbbb): 709814",
    ]);
  });

  it.each(["mock", "gateway"] as const)(
    "logs nothing derived from the phone except its last four digits (%s)",
    async (driver) => {
      process.env["SMS_DRIVER"] = driver;
      const lines: string[] = [];
      vi.spyOn(Logger.prototype, "log").mockImplementation((line: unknown) => {
        lines.push(String(line));
      });

      await makeAdapter().send(sms);

      // A hash of the phone beside its last four digits picks the number out
      // of the few thousand that share them, so no digest may reach the log.
      const logged = lines.join("\n");
      for (const algorithm of ["sha256", "sha1", "md5"]) {
        const digest = createHash(algorithm).update(sms.phone).digest("hex");
        expect(logged).not.toContain(digest.slice(0, 6));
      }
      expect(logged).not.toContain("65123456");
      expect(logged.replaceAll(sms.code, "").replaceAll(sms.requestId.slice(0, 8), "").match(/\d+/g)).toEqual(["3456"]);
    },
  );

  it("never writes the code to the log in gateway mode", async () => {
    process.env["SMS_DRIVER"] = "gateway";
    const lines: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    await makeAdapter().send(sms);

    expect(lines.join("")).not.toContain("709814");
  });
});
