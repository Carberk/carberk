"use client";
import { useActionState, useEffect } from "react";
import { IdentitySchemas } from "@auto-tm/contracts";
import { Button, Input } from "@auto-tm/ui/components";
import type { DeskLocale } from "@/lib/history-desk-copy";
import { staffCopy } from "@/lib/history-staff-copy";
import { staffAction, type StaffState } from "./actions";

export function HistoryStaffForm({ locale, initial = { status: "empty" } }: { locale: DeskLocale; initial?: StaffState }) {
  const [state, action, pending] = useActionState(staffAction.bind(null, locale), initial);
  const t = staffCopy[locale];
  const target = state.target;
  const refused = state.status === "denied" || state.status === "expired";
  useEffect(() => {
    if (target) window.history.replaceState(null, "", `${window.location.pathname}?targetId=${target.id}`);
  }, [target]);
  return <>
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
    {state.actor && <p className="mt-2 break-words text-sm text-muted-foreground">{t.actor}: <span className="font-medium text-foreground">{IdentitySchemas.formatDisplayName(state.actor, locale)}</span></p>}
    <section className="mt-8 max-w-3xl rounded-lg border bg-background p-5 sm:p-6" aria-busy={pending}>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium">{t.targetId}
          <Input name="targetId" defaultValue={target?.id} required disabled={pending || refused} className="mt-2 min-h-11" />
        </label>
        <Button type="submit" disabled={pending || refused} className="min-h-11">{pending ? t.finding : t.find}</Button>
      </form>
      <div role={state.status && !["saved", "empty", "missing"].includes(state.status) ? "alert" : "status"} aria-live="polite" className="mt-5 text-sm leading-6">
        {pending ? t.saving : state.status ? t[state.status] : null}
      </div>
      {state.status === "error" && <a href={target ? `?targetId=${target.id}` : "?"} className="mt-3 inline-block rounded-sm py-2 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{t.retry}</a>}
      {refused && <a href={`/login?reason=history-access&returnTo=${encodeURIComponent(`/vehicle-history/${locale}/staff`)}`} className="mt-3 inline-block rounded-sm py-2 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{t.signIn}</a>}
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
              <Input name="reason" required maxLength={500} className="mt-2 min-h-11" />
            </label>
            <Button type="submit" variant={target.capabilities[capability] ? "secondary" : "primary"} className="mt-3 min-h-11">{pending ? t.saving : target.capabilities[capability] ? t.revoke : t.grant}</Button>
          </fieldset>
        </form>)}
      </div>}
    </section>
  </>;
}
