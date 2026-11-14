"use client";
import { useActionState, useEffect, useState } from "react";
import { IdentitySchemas } from "@auto-tm/contracts";
import { Button, Input } from "@auto-tm/ui/components";
import { usePathname } from "next/navigation";

import { staffAction, type StaffState } from "./actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { staffCopy } from "@/lib/history-staff-copy";
import { historyAuth } from "@/lib/history-auth";

export function HistoryStaffForm({ locale: initialLocale, initial = { status: "empty" }, lookupId }: { locale: DeskLocale; initial?: StaffState; lookupId?: string | undefined }) {
  const locale = historyAuth(usePathname())?.locale ?? initialLocale;
  const [state, action, pending] = useActionState(staffAction.bind(null, locale), initial);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const t = staffCopy[locale];
  const target = state.target;
  const targetId = target?.id;
  const refused = state.status === "denied" || state.status === "expired";
  useEffect(() => {
    if (targetId) window.history.replaceState(null, "", `${window.location.pathname}?targetId=${targetId}`);
  }, [targetId]);
  useEffect(() => {
    if (state.status === "saved" && state.changed) {
      const key = `${state.target?.id}:${state.changed}`;
      setReasons((previous) => ({ ...previous, [key]: "" }));
    }
  }, [state]);
  return <>
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
    {state.actor && <p className="mt-2 break-words text-sm text-muted-foreground">{t.actor}: <span className="font-medium text-foreground">{IdentitySchemas.formatDisplayName(state.actor, locale)}</span></p>}
    <section className="mt-8 max-w-3xl rounded-lg border bg-background p-5 sm:p-6" aria-busy={pending}>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium">{t.targetId}
          <Input name="targetId" defaultValue={target?.id ?? lookupId} required disabled={pending || refused} className="mt-2 min-h-11" />
        </label>
        <Button type="submit" disabled={pending || refused} className="min-h-11">{pending ? t.finding : t.find}</Button>
      </form>
      <div role={state.status && !["saved", "empty", "missing"].includes(state.status) ? "alert" : "status"} aria-live="polite" className="mt-5 text-sm leading-6">
        {pending ? t.finding : state.status ? t[state.status] : null}
      </div>
      {state.status === "error" && (target ? <form action={action} className="mt-3">
        <input type="hidden" name="targetId" value={target.id} />
        <Button type="submit" variant="secondary" disabled={pending} className="min-h-11">{t.retry}</Button>
      </form> : <a href={lookupId ? `?targetId=${encodeURIComponent(lookupId)}` : "?"} className="mt-3 inline-block rounded-sm py-2 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{t.retry}</a>)}
      {refused && <a href={`/login?reason=${state.status === "expired" ? "session-expired" : "history-access"}&returnTo=${encodeURIComponent(`/vehicle-history/${locale}/staff`)}`} className="mt-3 inline-block rounded-sm py-2 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{t.signIn}</a>}
      {target && !refused && <div className="mt-6 border-t pt-6">
        <h2 className="text-sm font-medium text-muted-foreground">{t.target}</h2>
        <p className="mt-2 break-words text-lg font-semibold">{IdentitySchemas.formatDisplayName(target, locale)}</p>
        <p className="mt-1 break-all text-sm text-muted-foreground">{target.id}</p>
        {!target.eligible && <p role="status" className="mt-4 text-sm">{t.unavailable}</p>}
        {state.actor?.id === target.id && <p role="status" className="mt-4 text-sm">{t.self}</p>}
        {(["vehicle-history", "vehicle-history-payment-evidence"] as const).map((capability) => <form key={`${target.id}-${capability}`} action={action} className="mt-6 border-t pt-5">
          <input type="hidden" name="targetId" value={target.id} />
          <input type="hidden" name="capability" value={capability} />
          <input type="hidden" name="active" value={String(!target.capabilities[capability])} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{capability === "vehicle-history" ? t.operator : t.evidence}</h3>
            <span className="rounded-md bg-muted px-3 py-1 text-sm">{target.capabilities[capability] ? t.active : t.inactive}</span>
          </div>
          {capability !== "vehicle-history" && <p className="mt-3 max-w-prose text-sm leading-6 text-muted-foreground">{t.scope}</p>}
          <fieldset disabled={pending || state.status === "error" || state.actor?.id === target.id || (!target.eligible && !target.capabilities[capability])} className="mt-4">
            <label className="block text-sm font-medium">{t.reason}
              <textarea name="reason" required maxLength={500} rows={3} value={reasons[`${target.id}:${capability}`] ?? ""} onChange={(event) => setReasons((previous) => ({ ...previous, [`${target.id}:${capability}`]: event.target.value }))} className="mt-2 w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
            </label>
            <Button type="submit" variant={target.capabilities[capability] ? "secondary" : "primary"} className="mt-3 min-h-11">{pending ? t.saving : target.capabilities[capability] ? t.revoke : t.grant}</Button>
          </fieldset>
        </form>)}
      </div>}
    </section>
  </>;
}
