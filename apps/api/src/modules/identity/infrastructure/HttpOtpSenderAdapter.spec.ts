import { createHash } from "node:crypto";

import { Logger } from "@nestjs/common";

import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpOtpSenderAdapter } from "./HttpOtpSenderAdapter";

// The code is deliberately not a suffix of the phone: a code that shares
// digits with the mask would let a masking regression pass by coincidence.
const sms = {
  phone: "+99365123456",
  code: "709814",
  purpose: "listing-contact-phone" as const,
  locale: "ru" as const,
  requestId: "00000000-0000-4000-8000-000000000001",
};

describe("HttpOtpSenderAdapter", () => {
  const driver = process.env["SMS_DRIVER"];
  afterEach(() => {
    vi.restoreAllMocks();
    if (driver === undefined) delete process.env["SMS_DRIVER"];
    else process.env["SMS_DRIVER"] = driver;
  });

  it("refuses missing internal delivery metadata without logging", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    await expect(new HttpOtpSenderAdapter().send(sms)).rejects.toThrow("SMS delivery metadata refused");
    expect(log).not.toHaveBeenCalled();
  });

  it("builds the sms-gateway body { phone, body, requestId } with the rendered text", () => {
    expect(new HttpOtpSenderAdapter().gatewayRequest(sms)).toEqual({
      phone: "+99365123456",
      body: "Carberk 709814: номер будет в объявлении. Не давайте код без согласия",
      requestId: sms.requestId,
    });
  });

  it("renders the text in the seller's locale", () => {
    expect(new HttpOtpSenderAdapter().gatewayRequest({ ...sms, locale: "en" }).body).toBe(
      "Carberk code 709814 puts this number on a car listing. Share it only if you agree.",
    );
  });

  it.each(["mock", "gateway"])("still only logs in %s mode", async (mode) => {
    process.env["SMS_DRIVER"] = mode;
    await expect(new HttpOtpSenderAdapter().send(sms)).resolves.toBeUndefined();
  });

  it.each(["mock", "gateway"])(
    "writes only the last four digits of the phone number to the log in %s mode",
    async (mode) => {
      process.env["SMS_DRIVER"] = mode;
      const lines: string[] = [];
      vi.spyOn(Logger.prototype, "log").mockImplementation((line: unknown) => {
        lines.push(String(line));
      });

      await new HttpOtpSenderAdapter().send(sms);

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

    await new HttpOtpSenderAdapter().send(sms);

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
    const adapter = new HttpOtpSenderAdapter();

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

      await new HttpOtpSenderAdapter().send(sms);

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

    await new HttpOtpSenderAdapter().send(sms);

    expect(lines.join("")).not.toContain("709814");
  });
});
