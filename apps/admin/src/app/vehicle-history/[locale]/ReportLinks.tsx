"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@auto-tm/ui/components";

import { deskCopy, type DeskLocale } from "@/lib/history-desk-copy";

function reportTargets(text: string) {
  const targets: string[] = [];
  const scanner = /https:\/\/[^\s<>"“”‘’«»]+/giu;
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text)) !== null) {
    const before = text[match.index - 1] ?? "";
    if (before && !/[\s([{"'<“‘«]/u.test(before)) continue;
    let target = match[0];
    const closing = new Map([["(", ")"], ["[", "]"], ["{", "}"], ["'", "'"],
      ['"', '"'], ["<", ">"], ["“", "”"], ["‘", "’"], ["«", "»"]]).get(before);
    const after = text[match.index + match[0].length];
    if (after && !/\s/u.test(after) && after !== closing) continue;
    if (before === "'") {
      const end = target.lastIndexOf("'");
      if (end >= 0) target = target.slice(0, end);
    } else if (closing) {
      let depth = 0;
      for (let index = 0; index < target.length; index++) {
        if (target[index] === closing && depth === 0) { target = target.slice(0, index); break; }
        if (target[index] === before) depth++;
        else if (target[index] === closing) depth--;
      }
    } else if (target !== text && !/[?#]/u.test(target)) target = target.replace(/[.,;!]+$/u, "");
    scanner.lastIndex = match.index + target.length;
    try {
      const parsed = new URL(target);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password
        && /^https:\/\/[^/?#@]+/iu.test(target) && !/[\s\\\p{Cc}]/u.test(target)
        && !/%(?![\da-f]{2})/iu.test(target)) targets.push(target);
    } catch { continue; }
  }
  return targets;
}

export function ReportLinks({ text, locale, enabled, remember }: {
  text: string; locale: DeskLocale; enabled: boolean; remember: () => void;
}) {
  const targets = reportTargets(text);
  return targets.length > 0 && <div className="mt-3 space-y-3">{targets.map((target, index) =>
    <ReportLink key={`${index}:${target}`} target={target} number={index + 1} locale={locale} enabled={enabled} remember={remember} />)}</div>;
}

function ReportLink({ target, number, locale, enabled, remember }: {
  target: string; number: number; locale: DeskLocale; enabled: boolean; remember: () => void;
}) {
  const t = deskCopy[locale];
  const [status, setStatus] = useState<"" | "copying" | "copied" | "copyFailed" | "openAttempted" | "openFailed">("");
  const current = useRef({ mounted: true, enabled, attempt: 0 });
  current.current.enabled = enabled;
  useEffect(() => {
    const reader = current.current;
    reader.mounted = true;
    return () => { reader.mounted = false; reader.attempt++; };
  }, []);
  useEffect(() => {
    if (!enabled) { current.current.attempt++; setStatus(""); }
  }, [enabled]);
  function available() { return current.current.mounted && current.current.enabled && navigator.onLine && document.visibilityState !== "hidden"; }
  function open() {
    if (!available()) return;
    current.current.attempt++;
    remember();
    try {
      window.open(target, "_blank", "noopener,noreferrer");
      setStatus("openAttempted");
    } catch { setStatus("openFailed"); }
  }
  async function copy() {
    if (!available()) return;
    const attempt = ++current.current.attempt;
    setStatus("copying");
    let succeeded = false;
    try { await navigator.clipboard.writeText(target); succeeded = true; } catch { succeeded = false; }
    if (attempt !== current.current.attempt || !available()) return;
    setStatus(succeeded ? "copied" : "copyFailed");
  }
  const label = t.reportLink.replace("{number}", String(number));
  return <div role="group" aria-label={label} className="min-w-0 border-t border-foreground/15 pt-2">
    <p className="mb-1 text-xs text-foreground/80 [overflow-wrap:anywhere]">{label} · {new URL(target).hostname}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" className="min-h-11 max-w-full whitespace-normal" disabled={!enabled} onClick={open}
        aria-label={`${status === "openFailed" ? t.retryOpenReport : t.openReport} ${number}`}>{status === "openFailed" ? t.retryOpenReport : t.openReport}</Button>
      <Button type="button" variant="secondary" className="min-h-11 max-w-full whitespace-normal" disabled={!enabled || status === "copying"} onClick={() => void copy()}
        aria-busy={status === "copying"} aria-label={`${status === "copyFailed" ? t.retryCopyLink : t.copyLink} ${number}`}>{status === "copyFailed" ? t.retryCopyLink : t.copyLink}</Button>
    </div>
    <p role="status" aria-live="polite" className="mt-1 text-xs [overflow-wrap:anywhere]">{status === "copied" ? t.linkCopied
      : status === "copyFailed" ? t.copyLinkFailed : status === "openAttempted" ? t.openReportHelp : status === "openFailed" ? t.openReportFailed : ""}</p>
  </div>;
}
