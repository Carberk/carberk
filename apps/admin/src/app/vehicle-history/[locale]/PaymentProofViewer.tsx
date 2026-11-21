"use client";
import { useId, useLayoutEffect, useRef } from "react";
import { Button } from "@auto-tm/ui/components";

import { proofCopy } from "@/lib/history-proof-copy";
import type { DeskLocale } from "@/lib/history-desk-copy";

export function PaymentProofViewer({ locale, content, close, restoreFocus }: {
  locale: DeskLocale; content: { file: { contentType: string }; dataBase64: string }; close: () => void; restoreFocus: () => void;
}) {
  const t = proofCopy[locale], title = useId();
  const restore = useRef(restoreFocus); restore.current = restoreFocus;
  const dialog = useRef<HTMLDialogElement>(null), button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal(); button.current?.focus();
    return () => { element?.close(); restore.current(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={title} aria-modal="true" onCancel={(event) => { event.preventDefault(); close(); }}
    onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); button.current?.focus(); } }}
    className="fixed inset-0 m-auto h-[92dvh] max-h-[92dvh] w-[min(96vw,960px)] max-w-none rounded-xl border bg-background p-4 text-foreground backdrop:bg-black/60 sm:p-6">
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-4"><h2 id={title} className="text-xl font-semibold">{t.preview}</h2>
        <Button ref={button} variant="secondary" className="h-auto min-h-11 whitespace-normal" onClick={close}>{t.close}</Button></div>
      <div className="min-h-0 flex-1 overflow-auto"><img src={`data:${content.file.contentType};base64,${content.dataBase64}`} alt={t.preview} className="mx-auto h-auto min-w-0 max-w-full" /></div>
    </div>
  </dialog>;
}
