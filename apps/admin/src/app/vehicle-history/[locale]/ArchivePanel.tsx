"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { HistoryInboxResult } from "./actions";
import { historyReportAction } from "./report-actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { offerCopy } from "@/lib/history-offer-copy";
import { archiveCopy, reportCopy } from "@/lib/history-report-copy";

export function ArchivePanel({ locale, id, scope, version, vin, disabled, accepted, onChoose, invalidate }: {
  locale: DeskLocale; id: string; scope: string; version: number; vin: string; disabled: boolean;
  accepted?: (Pick<R.HistoryArchiveItem, "provider" | "format"> & { originalReportDate: string | null }) | undefined;
  onChoose: (item: R.HistoryArchiveItem) => void;
  invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = archiveCopy[locale];
  const offer = offerCopy[locale];
  const [items, setItems] = useState<R.HistoryArchiveItem[] | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error" | "denied" | "changed">("idle");
  const generation = useRef(0);
  useEffect(() => {
    const current = generation;
    function hide() {
      if (document.visibilityState !== "hidden") return;
      current.current++;
      setItems(null);
      setPhase("idle");
    }
    document.addEventListener("visibilitychange", hide);
    return () => {
      current.current++;
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  async function search() {
    const attempt = ++generation.current;
    setItems(null);
    setPhase("loading");
    try {
      const result = await historyReportAction(locale, { id, scope }, "archive", { vin, expectedAssignmentVersion: version });
      if (attempt !== generation.current) return;
      if (result.status === "archive") {
        setItems(result.items.filter((item) => item.vin === vin));
        setPhase("idle");
      } else if (result.status === "denied" || result.status === "expired" || result.status === "stale") {
        setPhase("denied"); invalidate({ status: result.status });
      } else if (result.status === "conflict") {
        setPhase("changed"); invalidate({ status: "conflict", scope });
      } else setPhase("error");
    } catch {
      if (attempt === generation.current) setPhase("error");
    }
  }

  return <section aria-label={t.title} aria-busy={phase === "loading"} className="space-y-3 border-t pt-3">
    <h5 className="font-semibold">{t.title}</h5>
    <Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal"
      disabled={disabled || phase === "loading" || phase === "denied" || phase === "changed"}
      onClick={() => { void search(); }}>{phase === "error" ? reportCopy[locale].retry : t.search}</Button>
    {phase === "loading" && <p role="status">{t.loading}</p>}
    {(phase === "error" || phase === "denied" || phase === "changed") && <p role="alert">{t[phase]}</p>}
    {items?.length === 0 && <p role="status">{t.empty}</p>}
    {!!items?.length && <ul className="divide-y border-y">{items.map((item) => {
      const compatible = !accepted || item.provider === accepted.provider && item.originalReportDate === accepted.originalReportDate
        && (item.format === accepted.format || item.format === "both");
      return <li key={item.id} className="space-y-2 py-3">
        <p className="break-words font-medium">{item.provider} · {offer[item.format]}</p>
        <p className="break-all font-mono">{item.vin}</p>
        <dl className="space-y-1">
          <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{offer.date}</dt><dd>{item.originalReportDate}</dd></div>
          <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{reportCopy[locale].language}</dt><dd>{item.language}</dd></div>
        </dl>
        {compatible ? <Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal" disabled={disabled}
          onClick={() => onChoose(item)}>{accepted ? t.associate : t.useDate}</Button>
          : <p className="text-muted-foreground">{t.incompatible}</p>}
      </li>;
    })}</ul>}
  </section>;
}
