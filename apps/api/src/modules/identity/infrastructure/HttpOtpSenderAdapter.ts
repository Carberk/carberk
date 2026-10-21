import { createHash } from "node:crypto";
import { PrismaService } from "@auto-tm/db";
import { Inject, Injectable, Logger } from "@nestjs/common";

import type { ClockPort } from "../domain/ports/ClockPort";
import { SystemClockAdapter } from "./SystemClockAdapter";
import { fromCodePurpose } from "./codePurpose";
import { renderCodeSms } from "../domain/codeSms";
import type { OtpSenderPort, OtpSms } from "../domain/ports/OtpSenderPort";

/** The body `apps/sms-gateway` `POST /v1/send` takes (ADR-0006). */
export interface GatewaySmsRequest {
  phone: string;
  body: string;
  requestId: string;
}

/**
 * The hosting log outlives the 30 days the privacy policy gives sign-in code
 * records, so a log line carries only the last four digits of the phone and
 * nothing else derived from it. A hash would not do: beside the last four
 * digits, even a short digest picks one number out of the few thousand that
 * share them.
 */
function maskedPhone(phone: string): string {
  return `***${phone.slice(-4)}`;
}

/**
 * Tells two requests apart when their phones share the last four digits. It
 * is the start of the code request's own id, which the caller receives in the
 * response as `requestId`, so the mock-SMS runbook and
 * `staging-reviewer-flow-smoke.mjs signup-probe-request` can find their line.
 */
function requestTag(requestId: string): string {
  return requestId.slice(0, 8);
}

@Injectable()
export class HttpOtpSenderAdapter implements OtpSenderPort {
  private readonly logger = new Logger(HttpOtpSenderAdapter.name);
  private readonly driver: "mock" | "gateway";

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SystemClockAdapter) private readonly clock: ClockPort,
  ) {
    this.driver = (process.env["SMS_DRIVER"] as "mock" | "gateway") ?? "mock";
  }

  gatewayRequest(sms: OtpSms): GatewaySmsRequest {
    return {
      phone: sms.phone,
      body: renderCodeSms(sms),
      requestId: sms.requestId,
    };
  }

  async send(sms: OtpSms): Promise<void> {
    const carrier = sms.smsDelivery;
    if (!carrier || !["ordinary", "campaign"].includes(carrier.kind)) throw new Error("SMS delivery metadata refused");
    const expectedKeys = carrier.kind === "ordinary" ? "kind" : "candidate,kind,namespace,requestId,reservationId";
    if (Object.keys(carrier).sort().join(",") !== expectedKeys) throw new Error("SMS delivery metadata refused");
    const codeHash = createHash("sha256").update(sms.code).digest("hex");
    if (carrier.kind === "campaign") {
      if (!/^[a-f0-9]{32}$/.test(carrier.reservationId) || !/^[a-f0-9]{40}$/.test(carrier.candidate) ||
        carrier.namespace !== `cf_${carrier.reservationId}` || carrier.requestId !== sms.requestId ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(sms.requestId) ||
        sms.purpose !== "listing-contact-phone" || this.driver !== "mock" ||
        process.env["AUTOTM_COMMIT_SHA"] !== carrier.candidate) throw new Error("Campaign SMS delivery refused");
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${carrier.namespace},0))::text`;
        const rows = await tx.$queryRawUnsafe<{ admitted: boolean }[]>(
          `SELECT "${carrier.namespace}".campaign_sms_authority($1,$2,$3,$4) AS admitted
            FROM "${carrier.namespace}".campaign_manifest m WHERE m.state='identities' AND m.candidate=$4
              AND m.profile='campaign897-full-v3' AND m.delivery_version=3
              AND m.sms_contract_hash=md5(pg_get_functiondef('"${carrier.namespace}".campaign_sms_authority(text,text,text,text)'::regprocedure))`,
          sms.requestId, sms.phone, codeHash, carrier.candidate);
        if (rows.length !== 1 || rows[0]?.admitted !== true) throw new Error("Campaign SMS delivery refused");
        const message = renderCodeSms(sms);
        await tx.$executeRawUnsafe(`INSERT INTO "${carrier.namespace}".campaign_sms_sink(request_id,message)
          VALUES($1,$2) ON CONFLICT(request_id) DO NOTHING`, sms.requestId, message);
        const retained = await tx.$queryRawUnsafe<{ message: string }[]>(
          `SELECT message FROM "${carrier.namespace}".campaign_sms_sink WHERE request_id=$1`, sms.requestId);
        if (retained.length !== 1 || retained[0]?.message !== message) throw new Error("Campaign SMS content changed");
      });
      return;
    }
    // An ordinary admission is never permission to send a missing or changed OTP.
    // This live read does not fence producers admitted before campaign preparation.
    const row = await this.prisma.otpRequest.findUnique({ where: { id: sms.requestId } });
    if (!row || row.channel !== "phone" || row.destination !== sms.phone || row.phone !== sms.phone ||
      row.codeHash !== codeHash || row.verifiedAt !== null || row.expiresAt <= this.clock.now() ||
      fromCodePurpose(row.purpose) !== sms.purpose) throw new Error("SMS request unavailable");
    if (this.driver === "mock") {
      this.logger.log(
        `[mock] OTP for ${maskedPhone(sms.phone)} (req ${requestTag(sms.requestId)}): ${sms.code}`,
      );
      return;
    }

    // gateway mode — the request below is what the SMS gateway takes. Posting
    // it waits for real-phone staging (ADR-0006), so this still only logs.
    const request = this.gatewayRequest(sms);
    this.logger.log(`[gateway] OTP for ${maskedPhone(request.phone)} dispatched`);
  }
}
