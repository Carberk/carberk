"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { HistoryReportArtifactSchemas as R, type HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { HistoryInboxResult } from "./actions";
import { historyReportAction } from "./report-actions";

import type { DeskLocale } from "@/lib/history-desk-copy";
import { reportCopy } from "@/lib/history-report-copy";

type Target = R.HistoryReportTarget;
type Intent = Extract<H.HistoryFulfilmentIntent, { status: "obtained" }>;
type Action = "read" | "validate" | "preview" | "deliver" | "restore";
type Copy = (typeof reportCopy)["en"];
type Feedback = Exclude<keyof Copy, "title">;
const control = "mt-1 block min-h-11 w-full min-w-0 rounded-md border bg-background px-2 py-2";
const button = "h-auto min-h-11 max-w-full whitespace-normal";

function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ReportArtifactPanel({ locale, id, scope, orderId, version, intent, canDeliver, onDelivered, invalidate }: {
  locale: DeskLocale; id: string; scope: string; orderId: string; version: number; intent: Intent;
  canDeliver: boolean; onDelivered: () => void;
  invalidate: (result: HistoryInboxResult) => void;
}) {
  const t = reportCopy[locale];
  const [view, setView] = useState<R.HistoryReportView | null>(null);
  const [pending, setPending] = useState<Action | null>("read");
  const [restoring, setRestoring] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const fileStatus = useId();
  const pdfInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const validatedStatus = useRef<HTMLParagraphElement>(null);
  const focusValidation = useRef(false);
  const current = useRef({ attempt: 0, invalidate, onDelivered });
  current.current.invalidate = invalidate;
  current.current.onDelivered = onDelivered;
  const { id: intentId, version: intentVersion, accepted: { format, acceptedRevision } } = intent;
  const needsPdf = format !== "link", needsLink = format !== "pdf";

  const run = useCallback(async (action: Action, artifactId?: string) => {
    const attempt = ++current.current.attempt;
    const target: Target = { orderId, expectedAssignmentVersion: version, intentId, intentVersion, acceptedRevision };
    setFeedback(null);
    setPreview(null);
    setPending(action);
    try {
      let value: Target | R.ValidateHistoryReport | R.DeliverHistoryReport = target;
      if (action === "deliver" && artifactId) value = { ...target, artifactId };
      const validates = action === "validate" || action === "restore";
      if (validates) {
        const file = pdfInput.current?.files?.[0], link = action === "validate" ? linkInput.current?.value : undefined;
        if (needsPdf && !file || action === "validate" && needsLink && !link) { setFeedback("missing"); return; }
        if (file && (file.size < 1 || file.size > R.MAX_REPORT_PDF_BYTES || !/\.pdf$/i.test(file.name))) {
          setFeedback("pdfInvalid"); return;
        }
        value = { ...target, ...(file ? { pdf: { filename: file.name, dataBase64: await base64(file) } } : {}), ...(link ? { link } : {}) };
      }
      if (attempt !== current.current.attempt) return;
      const result = await historyReportAction(locale, { id, scope }, action === "restore" ? "validate" : action, value);
      if (attempt !== current.current.attempt || document.visibilityState === "hidden") return;
      if (result.status === "expired" || result.status === "stale" || result.status === "denied") {
        current.current.invalidate({ status: result.status });
      } else if (result.status === "ok") {
        focusValidation.current = validates || action === "deliver";
        setView(result.view);
        if (validates) setRestoring(false);
        if (result.view.status === "delivered") current.current.onDelivered();
      } else if (result.status === "preview") {
        setPreview(result.dataBase64);
      } else {
        if (result.status === "conflict") setView(null);
        setFeedback(action === "restore" && result.status === "mismatch" ? "samePdf"
          : action === "preview" && result.status === "unavailable" ? "previewUnavailable" : result.status);
      }
    } catch {
      if (attempt === current.current.attempt) setFeedback(action === "preview" ? "previewUnavailable" : "unavailable");
    } finally {
      if (attempt === current.current.attempt) setPending(null);
    }
  }, [acceptedRevision, id, intentId, intentVersion, locale, needsLink, needsPdf, orderId, scope, version]);

  useEffect(() => {
    const request = current.current;
    void run("read");
    const clear = () => {
      if (document.visibilityState === "hidden") {
        request.attempt++;
        setPreview(null);
        setPending(null);
      }
    };
    document.addEventListener("visibilitychange", clear);
    return () => { request.attempt++; document.removeEventListener("visibilitychange", clear); };
  }, [run]);

  const status = view?.status;
  const isValidated = view?.status === "validated" || view?.status === "delivered";
  useLayoutEffect(() => {
    if (isValidated && focusValidation.current) {
      focusValidation.current = false;
      validatedStatus.current?.focus();
    }
  }, [isValidated, status, restoring]);
  return <section lang={locale} className="space-y-3 border-t pt-3" aria-label={t.title} aria-busy={pending !== null}>
    <h6 className="font-semibold">{t.title}</h6>
    {pending && <p role="status">{t[pending === "read" ? "loading" : pending === "preview" ? "previewing" : pending === "deliver" ? "delivering" : "saving"]}</p>}
    {feedback && <p role="alert">{t[feedback]}</p>}
    {!view && !pending && feedback !== "conflict" &&
      <Button type="button" variant="secondary" className={button} onClick={() => void run("read")}>{t.retry}</Button>}
    {isValidated && !restoring ? <>
      <p ref={validatedStatus} tabIndex={-1} role="status" className="font-medium">{t[view.status]}</p>
      <dl className="space-y-1">
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{t.reportId}</dt><dd className="break-all">{view.artifact.report.reportId}</dd></div>
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{t.language}</dt><dd>{view.artifact.report.language}</dd></div>
        {view.artifact.format !== "link" && <>
          <div><dt className="sr-only">{t.file}</dt><dd className="[overflow-wrap:anywhere]">{view.artifact.pdf.filename}</dd></div>
          <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{t.pages}</dt><dd>{view.artifact.pdf.pages}</dd></div>
        </>}
      </dl>
      <p>{t.rights}{view.artifact.format !== "pdf" && ` · ${t.linkReady}`}</p>
      {view.artifact.format !== "link" && <>
        <Button ref={previewButton} type="button" variant="secondary" className={button + " aria-disabled:opacity-50"}
          aria-disabled={pending !== null} onClick={() => { if (!pending) void run("preview"); }}>{feedback === "previewUnavailable" ? t.retryPreview : t.preview}</Button>
        {preview && <ReportPdf dataBase64={preview} title={t.preview} closeLabel={t.close} close={() => setPreview(null)}
          restoreFocus={() => previewButton.current?.focus()} />}
        {(feedback === "previewUnavailable" || feedback === "unavailable") && <Button type="button" variant="secondary"
          className={button} disabled={pending !== null} onClick={() => {
            setFeedback(null); setFilename(""); setRestoring(true);
          }}>{t.restorePdf}</Button>}
      </>}
      {view.status === "validated" && canDeliver && <Button data-fulfilment-next type="button" className={button}
        disabled={pending !== null} onClick={() => void run("deliver", view.artifact.id)}>{t.deliver}</Button>}
    </> : view && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!pending) void run(restoring ? "restore" : "validate"); }}>
      {!feedback && <p>{restoring ? t.samePdf : t[view.status]}</p>}
      {needsPdf && <div className="space-y-1">
        <p>{t.file}</p>
        <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden disabled={pending !== null}
          onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? "")} />
        <Button type="button" variant="secondary" className={button} aria-describedby={fileStatus}
          disabled={pending !== null} onClick={() => pdfInput.current?.click()}>{t.choosePdf}</Button>
        <p id={fileStatus} aria-live="polite" className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{filename || t.size}</p>
      </div>}
      {needsLink && !restoring && <label className="block">{t.link}<input ref={linkInput} className={control} type="password" inputMode="url"
        autoComplete="off" spellCheck={false} maxLength={2048} disabled={pending !== null} />
        <span className="mt-1 block text-xs text-muted-foreground">{t.linkHelp}</span></label>}
      <Button data-fulfilment-next type="submit" className={button + " aria-disabled:opacity-50"} aria-disabled={pending !== null}>
        {restoring ? t.restorePdf : t.validate}
      </Button>
      {restoring && <Button type="button" variant="secondary" className={button} disabled={pending !== null}
        onClick={() => { setFeedback(null); setRestoring(false); }}>{t.cancelRestore}</Button>}
    </form>}
  </section>;
}

function ReportPdf({ dataBase64, title, closeLabel, close, restoreFocus }: {
  dataBase64: string; title: string; closeLabel: string; close: () => void; restoreFocus: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const restore = useRef(restoreFocus);
  restore.current = restoreFocus;
  const [src, setSrc] = useState("");
  useLayoutEffect(() => {
    const element = dialog.current;
    const bytes = Uint8Array.from(atob(dataBase64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setSrc(url);
    element?.showModal();
    return () => { element?.close(); URL.revokeObjectURL(url); restore.current(); };
  }, [dataBase64]);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }}
    className="fixed inset-0 m-auto h-[92dvh] max-h-[92dvh] w-[min(96vw,960px)] max-w-none rounded-xl border bg-background p-4 text-foreground backdrop:bg-black/60 sm:p-6">
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        <Button type="button" variant="secondary" className={button} onClick={close}>{closeLabel}</Button>
      </div>
      {src && <iframe title={title} src={src} className="min-h-0 w-full flex-1 rounded-md border" />}
    </div>
  </dialog>;
}
