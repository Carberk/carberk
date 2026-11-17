"use server";

import { headers } from "next/headers";

import type { Locale } from "@/i18n/locales";
import { defaultLocale, locales } from "@/i18n/locales";
import type {
  ConfirmDeletionResult,
  DeletionApiContext,
  DeletionChannel,
  RequestDeletionResult,
} from "@/lib/account-deletion";
import { confirmAccountDeletion, requestAccountDeletion } from "@/lib/account-deletion";
import { readVisitorIpPolicy, visitorIp } from "@/lib/visitor-ip";


const API_BASE_URL =
  process.env["API_BASE_URL"] ||
  process.env["NEXT_PUBLIC_API_URL"] ||
  "http://localhost:3006/api/v1";


const VISITOR_IP_POLICY = readVisitorIpPolicy();


function channelOf(value: unknown): DeletionChannel | null {
  return value === "phone" || value === "email" ? value : null;
}

async function apiContext(locale: unknown): Promise<DeletionApiContext> {
  const requestHeaders = await headers();
  return {
    baseUrl: API_BASE_URL,
    locale: locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale,
    clientIp: visitorIp(requestHeaders, VISITOR_IP_POLICY),
    clientIpHeader: VISITOR_IP_POLICY.apiHeader,
  };
}

export async function requestDeletionCode(
  locale: Locale,
  channel: DeletionChannel,
  value: string,
): Promise<RequestDeletionResult> {
  const checkedChannel = channelOf(channel);
  if (!checkedChannel || typeof value !== "string") {
    return { ok: false, error: "invalid-value" };
  }
  return requestAccountDeletion(checkedChannel, value, await apiContext(locale));
}

export async function confirmDeletion(
  locale: Locale,
  channel: DeletionChannel,
  destination: string,
  code: string,
): Promise<ConfirmDeletionResult> {
  const checkedChannel = channelOf(channel);
  if (!checkedChannel || typeof destination !== "string") {
    return { ok: false, error: "invalid-value" };
  }
  if (typeof code !== "string") return { ok: false, error: "invalid-code-format" };
  return confirmAccountDeletion(
    checkedChannel,
    destination,
    code,
    await apiContext(locale),
  );
}
