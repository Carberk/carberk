import type { SignInCodePurpose } from "../OtpRequest";

/** Captured only by committed repository admission; never accepted from HTTP. */
export type SmsDelivery =
  | { kind: "ordinary" }
  | { kind: "campaign"; reservationId: string; candidate: string; namespace: string; requestId: string };

/** One SMS code to send. The adapter renders the text for the purpose and locale (ADR-0081). */
export interface OtpSms {
  smsDelivery: SmsDelivery;
  phone: string;
  code: string;
  purpose: SignInCodePurpose;
  locale: "ru" | "tk" | "en";
  requestId: string;
}

export interface OtpSenderPort {
  send(sms: OtpSms): Promise<void>;
}
