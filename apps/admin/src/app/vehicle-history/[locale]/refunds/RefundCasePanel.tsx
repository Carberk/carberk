"use client";

import { useActionState, useState, type FormEvent } from "react";
import { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { RefundResult, RefundMode } from "./actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { offerCopy } from "@/lib/history-offer-copy";
import { promiseRecoveryCopy } from "@/lib/history-promise-recovery-copy";
import { refundCopy } from "@/lib/history-refund-copy";

type RefundAction = (state: RefundResult, form: FormData) => Promise<RefundResult>;

export function RefundCaseError({ locale, href, status }: {
  locale: DeskLocale; href: string; status: Exclude<RefundResult, { status: "ok" }>["status"];
}) {
  const t = refundCopy[locale];
  const needsSignIn = status === "denied" || status === "expired";
  return <div className="space-y-2 rounded-lg border p-4">
    <p role="alert">{t[status]}</p>
    <a className="inline-block py-2 font-medium underline" href={needsSignIn ? `/login?returnTo=${encodeURIComponent(href)}` : href}>
      {needsSignIn ? t.signIn : t.refresh}
    </a>
  </div>;
}

export function RefundCasePanel({ locale, mode, href, initial, action }: {
  locale: DeskLocale; mode: RefundMode; href: string; initial: H.HistoryRefundCase; action: RefundAction;
}) {
  const t = refundCopy[locale], recovery = promiseRecoveryCopy[locale], offer = offerCopy[locale];
  const [result, submit, saving] = useActionState<RefundResult, FormData>(action, { status: "ok", data: initial, scope: "" });
  const [invalidField, setInvalidField] = useState<"reason" | "externalReference" | null>(null);
  if (result.status !== "ok") return <RefundCaseError locale={locale} href={href} status={result.status} />;
  const { order, payment, refund, reason, failure } = result.data;
  const date = new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZone: "Asia/Ashgabat",
  });
  const money = new Intl.NumberFormat(locale === "tk" ? "en-GB" : locale, { style: "currency", currency: "TMT", currencyDisplay: "code" });
  const timestamp = (value: string) => date.format(new Date(value));
  const approving = mode === "decision" && refund.status === "pending";
  const executing = mode === "execution" && refund.status === "approved";
  function validate(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const { reason, externalReference } = H.HistoryRefundCommandSchema.options[1].shape;
    const field = !reason.safeParse(form.get("reason")).success ? "reason"
      : executing && !externalReference.safeParse(form.get("externalReference")).success ? "externalReference" : null;
    setInvalidField(field);
    if (field) {
      event.preventDefault();
      const control = event.currentTarget.elements.namedItem(field);
      if (control instanceof HTMLElement) control.focus();
    }
  }
  const reasonText = reason === "no_window" ? t.noWindow : reason === "company_error" ? t.companyError
    : reason === "replacement_declined" ? t.lateDeclined : recovery[reason];
  const facts: [string, string][] = [
    ["VIN", order.vin],
    [offer.format, offer[order.format]],
    [t.price, money.format(order.priceMinor / 100)],
    [t.window, `${timestamp(order.window.deliveryFrom)} – ${timestamp(order.window.deliveryBy)}`],
    [recovery.original, timestamp(refund.originalPromiseBy)],
  ];
  if (refund.agreedRecoveryDeadline) facts.push([recovery.agreedDeadline, timestamp(refund.agreedRecoveryDeadline)]);
  facts.push([t.amount, money.format(payment.amountMinor / 100)], [t.received, timestamp(payment.receivedAt)],
    [t.confirmed, timestamp(payment.confirmedAt)], [t.matching, payment.reference]);
  if (refund.status !== "pending") facts.push([t.approvedAt, timestamp(refund.approvedAt)]);
  if (refund.status === "completed") facts.push([t.recorded, timestamp(refund.recordedAt)], [t.reference, refund.externalReference]);

  return <section className="space-y-4 rounded-lg border bg-background p-4 sm:p-6" aria-busy={saving}>
    <h2 className="text-lg font-semibold"><span role="status">{t[refund.status]}</span></h2>
    <p>{reasonText}</p>
    {failure && failure !== reason && <p>{failure === "company_error" ? t.companyError : recovery[failure]}</p>}
    <p className="text-sm text-muted-foreground">{recovery.zone}</p>
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <dd className="wrap-anywhere">{value}</dd>
      </div>)}
    </dl>
    {(approving || executing) && <form action={submit} onSubmit={validate} className="border-t pt-4">
      <fieldset disabled={saving} className="min-w-0 space-y-3">
        <label className="block font-medium">{t.reason}
          <textarea name="reason" required maxLength={500} aria-invalid={invalidField === "reason" || undefined} aria-describedby={invalidField === "reason" ? "refund-reason-error" : undefined} className="mt-1 block min-h-20 w-full rounded-md border bg-background p-2" />
        </label>
        {invalidField === "reason" && <p id="refund-reason-error" role="alert" className="text-destructive">{t.reasonInvalid}</p>}
        {executing && <>
          <label className="block font-medium">{t.reference}
            <input name="externalReference" required maxLength={160} aria-invalid={invalidField === "externalReference" || undefined} aria-describedby={invalidField === "externalReference" ? "refund-reference-error" : undefined} className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2" />
          </label>
          {invalidField === "externalReference" && <p id="refund-reference-error" role="alert" className="text-destructive">{t.referenceInvalid}</p>}
          <label className="flex min-h-11 items-start gap-2">
            <input name="returned" type="checkbox" required className="mt-1 size-5 shrink-0" />{t.returned}
          </label>
        </>}
        {approving && <p className="text-sm text-muted-foreground">{t.approvalHelp}</p>}
        <Button type="submit" className="h-auto min-h-11 whitespace-normal">{approving ? t.approve : t.record}</Button>
      </fieldset>
      {saving && <p role="status" className="mt-2">{t.saving}</p>}
    </form>}
  </section>;
}
