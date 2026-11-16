"use client";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { IdentitySchemas } from "@auto-tm/contracts";
import { Button } from "@auto-tm/ui/components";

import type { HistoryListingFailure, HistoryListingResult } from "../../../lib/history-listing-envelope";
import type { DeskLocale } from "../../../lib/history-desk-copy";
import { historyListingDetailsCopy, historyListingFactCopy } from "../../../lib/history-listing-copy";

import { historyListingAction } from "./listing-actions";
import { SourceListingMedia, type SourceListingPosition } from "./SourceListingMedia";

type Props = {
  open: boolean; locale: DeskLocale; id: string; scope: string; actorId: string;
  expectedAssignmentVersion: number; onClose: () => void;
  onInvalidate: (failure: HistoryListingFailure) => void;
  returnQuery?: string;
};
type Detail = Extract<HistoryListingResult, { kind: "detail" }>;

export function SourceListing(props: Props) {
  const binding = [props.id, props.scope, props.actorId, props.expectedAssignmentVersion, props.locale].join("\0");
  const current = useRef("");
  current.current = props.open ? binding : "";
  return props.open ? <ListingDialog key={binding} {...props} current={() => current.current === binding} /> : null;
}

function ListingDialog(props: Props & { current: () => boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const resumePosition = useRef<SourceListingPosition>({ identity: "", seconds: 0 });
  const [detail, setDetail] = useState<Detail>();
  const [state, setState] = useState<"ready" | keyof (typeof historyListingDetailsCopy)["en"]>("loading");
  const lifetime = useRef({ active: false, attempt: 0 });
  const latest = useRef(props);
  latest.current = props;
  const copy = historyListingDetailsCopy[props.locale];
  const valid = useCallback((attempt: number) => lifetime.current.active && latest.current.current() &&
    attempt === lifetime.current.attempt && !document.hidden && navigator.onLine, []);
  const invalidate = useCallback((failure: HistoryListingFailure) => {
    lifetime.current.attempt++;
    setDetail(undefined);
    setState(failure.status);
    latest.current.onInvalidate(failure);
  }, []);
  const read = useCallback(async () => {
    const attempt = ++lifetime.current.attempt;
    setDetail(undefined);
    if (!navigator.onLine || document.hidden) { setState(navigator.onLine ? "suspended" : "offline"); return; }
    setState("loading");
    const binding = latest.current;
    try {
      const result = await historyListingAction(binding.locale, {
        kind: "detail", id: binding.id, scope: binding.scope, expectedAssignmentVersion: binding.expectedAssignmentVersion,
      });
      if (!valid(attempt)) return;
      if (result.status !== "ok") {
        setState(result.status);
        if (result.status === "expired" || result.status === "stale" || result.status === "denied" || result.status === "conflict") {
          binding.onInvalidate(result);
        }
        return;
      }
      if (result.kind !== "detail" || result.id !== binding.id || result.scope !== binding.scope ||
        result.actor.id !== binding.actorId || result.expectedAssignmentVersion !== binding.expectedAssignmentVersion ||
        result.sourceListingId !== result.data.listing.id) {
        invalidate({ status: "conflict" });
        return;
      }
      setDetail(result);
      setState("ready");
    } catch {
      if (valid(attempt)) setState("unavailable");
    }
  }, [invalidate, valid]);
  const suspend = useCallback((reason: "offline" | "suspended") => {
    lifetime.current.attempt++;
    setDetail(undefined);
    setState(reason);
  }, []);
  const close = useCallback(() => {
    suspend("suspended");
    latest.current.onClose();
  }, [suspend]);
  useLayoutEffect(() => {
    const element = dialog.current;
    const invoker = document.activeElement;
    const current = lifetime.current;
    current.active = true;
    element?.showModal();
    heading.current?.focus();
    const hidden = () => { if (document.hidden) suspend("suspended"); };
    const offline = () => suspend("offline");
    const leave = () => suspend("suspended");
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", leave);
    window.addEventListener("popstate", leave);
    void read();
    return () => {
      current.active = false;
      current.attempt++;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("popstate", leave);
      element?.close();
      queueMicrotask(() => {
        if (invoker instanceof HTMLElement && invoker.isConnected && document.activeElement === document.body) invoker.focus();
      });
    };
  }, [close, read, suspend]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), video[controls], [tabindex="0"]',
      )];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-lg border bg-background p-5 text-foreground">
    <header className="sticky -top-5 z-10 -mx-5 -mt-5 mb-5 flex flex-wrap items-start justify-between gap-4 border-b bg-background p-5">
      <h2 ref={heading} tabIndex={-1} id={titleId} className="break-words text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{copy.title}{detail ? ` ${detail.data.listing.publicNumber}` : ""}</h2>
      <Button type="button" size="lg" variant="secondary" onClick={close}>{copy.close}</Button>
      {props.returnQuery !== undefined && <nav aria-label={props.locale === "tk" ? "Dil" : props.locale === "ru" ? "Язык" : "Language"} className="flex w-full gap-1">
        {(["tk", "ru", "en"] as const).map((language) => <a key={language} lang={language} aria-current={language === props.locale ? "page" : undefined}
          href={`/vehicle-history/${language}?${new URLSearchParams([...new URLSearchParams(props.returnQuery)].filter(([name, value]) =>
            ["filter", "search", "cursor", "selected", "v"].includes(name) || name === "source" && value === "listing"))}`}
          className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted">{language.toUpperCase()}</a>)}
      </nav>}
    </header>
    {detail && state === "ready" ? <>
      <ListingFacts detail={detail} locale={props.locale} />
      <SourceListingMedia open={props.open} locale={props.locale} id={props.id} scope={props.scope}
        actorId={props.actorId} expectedAssignmentVersion={props.expectedAssignmentVersion}
        detail={detail} onInvalidate={invalidate} resumePosition={resumePosition} />
    </> : <div role={state === "loading" ? "status" : "alert"} aria-busy={state === "loading"} className="space-y-4 py-6">
      <p>{state === "ready" ? copy.unavailable : copy[state]}</p>
      {state !== "loading" && <Button type="button" size="lg" onClick={() => void read()}>{copy.retry}</Button>}
    </div>}
  </dialog>;
}

function ListingFacts({ detail, locale }: { detail: Detail; locale: DeskLocale }) {
  const { listing: car, labels } = detail.data;
  const t = historyListingFactCopy(locale);
  const number = new Intl.NumberFormat(locale === "tk" ? "en-GB" : locale);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "ru" ? "ru" : "en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "Asia/Ashgabat",
  }).format(new Date(value)) + " UTC+5";
  const title = [labels.brand ?? t.catalogUnavailable, labels.model ?? t.catalogUnavailable, car.generationId ? labels.generation ?? t.catalogUnavailable : undefined].filter(Boolean).join(" ");
  const rows: [string, string | undefined][] = [
    [t.price, `${number.format(car.priceAmount)} ${car.priceCurrency}`],
    [t.priceTmt, car.priceCurrency !== "TMT" ? `${number.format(car.displayPriceTmt)} TMT` : undefined],
    [t.location, [labels.region ?? t.catalogUnavailable, labels.city ?? t.catalogUnavailable, car.locationText].filter(Boolean).join(" · ")],
    [t.year, car.year === undefined ? undefined : String(car.year)],
    [t.vin, car.vin],
    [t.condition, car.condition ? t[car.condition] : undefined],
    [t.mileage, car.mileageKm === undefined ? undefined : `${number.format(car.mileageKm)} ${t.kilometres}`],
    [t.color, car.colorId ? labels.color ?? t.catalogUnavailable : undefined],
    [t.bodyType, car.bodyTypeId ? labels.bodyType ?? t.catalogUnavailable : undefined],
    [t.transmission, car.transmissionId ? labels.transmission ?? t.catalogUnavailable : undefined],
    [t.driveType, car.driveTypeId ? labels.driveType ?? t.catalogUnavailable : undefined],
    [t.engineType, car.engineTypeId ? labels.engineType ?? t.catalogUnavailable : undefined],
    [t.power, car.enginePower === undefined ? undefined : `${number.format(car.enginePower)} ${t.hp}`],
    [t.exchange, car.acceptsExchange ? t.yes : t.no],
    [t.installments, car.installmentAvailable ? t.yes : t.no],
    [t.status, car.status === "banned" ? undefined : t[car.status]],
    [t.published, date(car.publishedAt)],
    [t.sold, car.soldAt ? date(car.soldAt) : undefined],
    [t.created, date(car.createdAt)],
    [t.updated, date(car.updatedAt)],
    [t.seller, car.seller.deleted ? t.deletedSeller : IdentitySchemas.formatDisplayName(car.seller, locale)],
    [t.memberSince, date(car.seller.memberSince)],
  ];
  if (!car.conditionDisclosure) rows.push([t.damaged, t.unavailable]);
  if (car.conditionDisclosure) {
    rows.push([t.damaged, car.conditionDisclosure.damaged ? t.yes : t.no]);
    rows.push([t.issues, car.conditionDisclosure.knownIssuesText]);
  }
  if (!car.vinHistory?.decoded) rows.push([t.decoder, car.vinHistory ? t.undecoded : t.unavailable]);
  if (car.vinHistory?.decoded) {
    const decoded = car.vinHistory;
    rows.push([t.decoder, [decoded.brand, decoded.model, decoded.year, decoded.bodyType, decoded.engineType]
      .filter((value) => value !== undefined && value !== "").join(" · ")]);
    rows.push([t.confidence, `${number.format(decoded.confidence * 100)}% · ${t.uncertainty}`]);
  }
  return <section className="mb-6 min-w-0">
    {title && <h3 className="mb-4 break-words text-lg font-semibold">
      {title}{car.year === undefined ? "" : ` · ${car.year}`}
    </h3>}
    <dl className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
      {rows.filter(([, value]) => value !== undefined && value !== "").map(([label, value], index) =>
        <div key={index} className="min-w-0 space-y-1 py-1 [overflow-wrap:anywhere]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-wrap tabular-nums">{value}</dd>
        </div>)}
    </dl>
    <h3 className="mt-5 mb-2 font-semibold">{t.description}</h3>
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{car.description || t.unavailable}</p>
  </section>;
}
