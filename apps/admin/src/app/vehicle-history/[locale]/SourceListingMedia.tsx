"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@auto-tm/ui/components";
import type { ListingsSchemas as L } from "@auto-tm/contracts";
import type HlsPlayerInstance from "hls.js";
import type { ErrorData } from "hls.js";

import type { DeskLocale } from "../../../lib/history-desk-copy";
import type { HistoryListingFailure, HistoryListingResult } from "../../../lib/history-listing-envelope";
import { historyListingMediaCopy } from "../../../lib/history-listing-copy";

import { historyListingAction } from "./listing-actions";

type Detail = Extract<HistoryListingResult, { kind: "detail" }>;
export type SourceListingPosition = { identity: string; seconds: number };
type Lifetime = { mounted: boolean; attempt: number; dispose: () => void };
type PlaybackError = "videoFailed" | "unsupported" | "expired";
type Props = {
  open: boolean; locale: DeskLocale; id: string; scope: string; actorId: string;
  expectedAssignmentVersion: number; detail: Detail;
  onInvalidate: (failure: HistoryListingFailure) => void;
  resumePosition?: { current: SourceListingPosition };
};

export function SourceListingMedia(props: Props) {
  const rendered = useRef("");
  const { detail, id, scope, actorId, expectedAssignmentVersion, locale } = props;
  const matches = detail.id === id && detail.scope === scope && detail.actor.id === actorId &&
    detail.expectedAssignmentVersion === expectedAssignmentVersion && detail.sourceListingId === detail.data.listing.id;
  const key = [id, scope, actorId, expectedAssignmentVersion, locale, detail.sourceListingId].join("\0");
  rendered.current = props.open && matches ? key : "";
  return rendered.current ? <Media key={key} {...props} current={() => rendered.current === key} /> : null;
}

function Media(props: Props & { current: () => boolean }) {
  const copy = historyListingMediaCopy[props.locale];
  const [index, setIndex] = useState(0);
  const [media, setMedia] = useState(props.detail.data.listing.media);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [failure, setFailure] = useState<HistoryListingFailure>();
  const [loading, setLoading] = useState(false);
  const [cover, setCover] = useState<L.VideoAccessResponse>();
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverLoading, setCoverLoading] = useState(true);
  const [grant, setGrant] = useState<{ data: L.VideoAccessResponse; attempt: number }>();
  const [pending, setPending] = useState(false);
  const [playError, setPlayError] = useState<PlaybackError>();
  const [suspended, setSuspended] = useState<"offline" | "suspended">();
  const localPosition = useRef<SourceListingPosition>({ identity: "", seconds: 0 });
  const position = props.resumePosition ?? localPosition;
  const latest = useRef(props);
  latest.current = props;
  const [lifetime] = useState<Lifetime>(() => ({ mounted: false, attempt: 0, dispose: () => {} }));
  const allowed = useCallback(() => lifetime.mounted && latest.current.current() && !document.hidden && navigator.onLine, [lifetime]);
  const stop = useCallback(() => {
    lifetime.attempt += 1;
    lifetime.dispose(); setGrant(undefined); setPending(false);
  }, [lifetime]);
  const read = useCallback(async function read(kind: "detail" | "cover" | "play", initial = false): Promise<void> {
    if (!allowed()) return;
    const binding = latest.current;
    if (!initial) stop();
    const current = lifetime.attempt;
    if (kind === "detail") { setMedia([]); setLoading(true); setFailure(undefined); setSuspended(undefined); }
    else if (kind === "cover") { setCover(undefined); setCoverFailed(false); setCoverLoading(true); }
    else { setPending(true); setPlayError(undefined); }
    try {
      const result = await historyListingAction(binding.locale, {
        kind, id: binding.id, scope: binding.scope, expectedAssignmentVersion: binding.expectedAssignmentVersion,
      });
      if (!allowed() || current !== lifetime.attempt) return;
      if (result.status !== "ok") {
        const refused = result.status === "absent" ? { status: "conflict" as const } : result;
        if (refused.status !== "video-unavailable" || kind === "detail") setFailure(refused);
        else if (kind === "play") setPlayError("videoFailed"); else setCoverFailed(true);
        if (refused.status !== "video-unavailable") latest.current.onInvalidate(refused);
      } else if (result.kind !== kind || result.id !== binding.id || result.scope !== binding.scope ||
        result.actor.id !== binding.actorId || result.expectedAssignmentVersion !== binding.expectedAssignmentVersion ||
        result.sourceListingId !== binding.detail.sourceListingId) {
        const refused = { status: "conflict" as const };
        setFailure(refused); latest.current.onInvalidate(refused);
      } else if (result.kind === "detail") {
        setMedia(result.data.listing.media); setIndex(0); setFailedPhotos([]); void read("cover", true);
      }
      else {
        setCover(result.data);
        setCoverFailed(false);
        if (kind === "play") {
          const identity = `${result.data.video?.id}\0${result.data.video?.generationId}`;
          if (position.current.identity !== identity) position.current = { identity, seconds: 0 };
          setGrant({ data: result.data, attempt: current });
        }
      }
    } catch {
      if (allowed() && current === lifetime.attempt) {
        if (kind === "detail") setFailure({ status: "unavailable" });
        else if (kind === "play") setPlayError("videoFailed"); else setCoverFailed(true);
      }
    } finally {
      if (allowed() && current === lifetime.attempt) {
        if (kind === "detail") setLoading(false); else if (kind === "cover") setCoverLoading(false); else setPending(false);
      }
    }
  }, [allowed, lifetime, position, stop]);
  useLayoutEffect(() => {
    lifetime.mounted = true;
    void read("cover", true);
    const pause = (reason: "offline" | "suspended") => {
      stop(); setMedia([]); setCover(undefined); setLoading(false); setCoverLoading(false); setSuspended(reason);
    };
    const hide = () => { if (document.hidden) pause("suspended"); };
    const offline = () => pause("offline");
    const leave = () => pause("suspended");
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("offline", offline); window.addEventListener("pagehide", leave); window.addEventListener("popstate", leave);
    return () => {
      lifetime.mounted = false; lifetime.attempt += 1; lifetime.dispose();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("offline", offline); window.removeEventListener("pagehide", leave); window.removeEventListener("popstate", leave);
    };
  }, [lifetime, read, stop]);
  const playbackFailed = useCallback((error: PlaybackError, playbackAttempt: number) => {
    if (!allowed() || playbackAttempt !== lifetime.attempt) return;
    stop(); setPlayError(error);
    if (error === "expired") setCoverFailed(true);
  }, [allowed, lifetime, stop]);
  const photos = [...media].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const selected = photos[index];
  const imageAttempt = lifetime.attempt;
  const photoError = (key: string) => {
    if (allowed() && imageAttempt === lifetime.attempt) setFailedPhotos((old) => [...old, key]);
  };
  const select = (next: number) => {
    if (!allowed()) return;
    const selectedIndex = Math.max(0, Math.min(photos.length - 1, next));
    if (selectedIndex === index && !grant && !pending && !coverLoading) return;
    stop();
    if (coverLoading) { setCoverLoading(false); setCoverFailed(true); }
    setIndex(selectedIndex);
  };
  const blocked = suspended ?? (typeof navigator !== "undefined" && !navigator.onLine ? "offline" :
    typeof document !== "undefined" && document.hidden ? "suspended" : undefined);
  if (blocked) return <div><p role="status">{copy[blocked]}</p>
    <Button type="button" size="lg" onClick={() => void read("detail")}>{copy.retry}</Button></div>;
  if (failure) return <div><p role="alert">{failure.status === "unavailable" ? copy.unavailable : copy.denied}</p>
    <Button type="button" size="lg" onClick={() => void read("detail")}>{copy.retry}</Button></div>;
  return <div className="min-w-0 space-y-6">
    <section aria-label={copy.gallery} onKeyDown={(event) => {
      const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: photos.length - 1 }[event.key];
      if (next !== undefined) { event.preventDefault(); select(next); }
    }}>
      {loading ? <p role="status">{copy.loading}</p> : selected ? <>
        {failedPhotos.includes(selected.id) ? <p role="alert">{copy.photoFailed}</p> :
        <img key={selected.id} src={selected.variants.detail} alt={copy.photo(index + 1, photos.length)} onError={() => photoError(selected.id)}
          className="aspect-[4/3] w-full rounded-md bg-muted object-contain" referrerPolicy="no-referrer" />
        }
        {failedPhotos.length > 0 && <Button type="button" size="lg" onClick={() => void read("detail")}>{copy.retryPhotos}</Button>}
        <div className="mt-3 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="secondary" size="lg" className="whitespace-normal" disabled={index === 0} onClick={() => select(index - 1)}>{copy.previous}</Button>
          <p aria-live="polite" className="text-center text-sm tabular-nums">{copy.count(index + 1, photos.length)}</p>
          <Button type="button" variant="secondary" size="lg" className="whitespace-normal" disabled={index === photos.length - 1} onClick={() => select(index + 1)}>{copy.next}</Button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {photos.map((photo, n) => <button key={photo.id} type="button" aria-label={copy.thumbnail(n + 1)}
            aria-pressed={n === index} onClick={() => select(n)}
            className="h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 border-border aria-pressed:border-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500">
            {failedPhotos.includes(`${photo.id}:thumbnail`) ? copy.photoFailed :
              <img src={photo.variants.thumbnail} alt="" onError={() => photoError(`${photo.id}:thumbnail`)}
                className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
          </button>)}
        </div>
      </> : <p>{copy.noPhotos}</p>}
    </section>
    <section aria-label={copy.video} className="space-y-3">
      {grant ? <Playback key={grant.attempt} data={grant.data} copy={copy} lifetime={lifetime} position={position.current}
        allowed={allowed} playbackAttempt={grant.attempt} onFailure={playbackFailed} />
      : coverLoading || pending ? <p role="status">{copy.loading}</p> : coverFailed ? <>
        <p role="alert">{copy.coverFailed}</p>
        <Button type="button" size="lg" onClick={() => void read("cover")}>{copy.retryCover}</Button>
      </> : cover?.video ? <img src={cover.video.cover.detail} alt={copy.cover} referrerPolicy="no-referrer"
        onError={() => { if (allowed() && imageAttempt === lifetime.attempt) setCoverFailed(true); }}
        className="aspect-[4/3] w-full rounded-md bg-muted object-contain" /> : <p>{copy.noVideo}</p>}
      {playError && <p role="alert">{copy[playError]}</p>}
      {cover?.video && !grant && !pending && <Button type="button" size="lg" onClick={() => void read("play")}>{playError ? copy.retryPlayback : copy.play}</Button>}
      {(grant || pending) && <Button type="button" variant="secondary" size="lg" onClick={stop}>{copy.closeVideo}</Button>}
    </section>
  </div>;
}

function Playback({ data, copy, allowed, lifetime, playbackAttempt, position, onFailure }: {
  data: L.VideoAccessResponse; copy: (typeof historyListingMediaCopy)[DeskLocale]; allowed: () => boolean;
  lifetime: Lifetime; playbackAttempt: number; onFailure: (error: PlaybackError, playbackAttempt: number) => void;
  position: SourceListingPosition;
}) {
  const media = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useLayoutEffect(() => {
    const element = media.current;
    if (!element) return;
    let live = true, manifest = false, metadata = false, started = false;
    let player: HlsPlayerInstance | undefined;
    const timer: { value?: ReturnType<typeof setTimeout> } = {};
    const expiresAt = Date.parse(data.expiresAt ?? "");
    const expired = () => !Number.isFinite(expiresAt) || Date.now() >= expiresAt;
    let removeHlsHandlers = () => {};
    const admitted = () => live && allowed() && playbackAttempt === lifetime.attempt;
    const detach = () => { element.pause(); element.removeAttribute("src"); element.srcObject = null; element.load(); };
    const cleanup = () => {
      if (live && Number.isFinite(element.currentTime) && element.currentTime >= 0) position.seconds = element.currentTime;
      live = false;
      element.removeEventListener("loadedmetadata", loaded);
      element.removeEventListener("error", failed);
      if (timer.value !== undefined) clearTimeout(timer.value);
      removeHlsHandlers(); removeHlsHandlers = () => {}; player?.destroy(); player = undefined;
      detach();
    };
    const fail = (error: PlaybackError) => { if (admitted()) { cleanup(); onFailure(error, playbackAttempt); } };
    const failed = () => fail(expired() ? "expired" : "videoFailed");
    const start = () => {
      if (!admitted() || !manifest || !metadata || started) return;
      if (expired()) { fail("expired"); return; }
      started = true;
      try {
        const duration = Number.isFinite(element.duration) ? element.duration : (data.video?.durationMs ?? 0) / 1000;
        element.currentTime = Math.max(0, Math.min(duration, Number.isFinite(position.seconds) ? position.seconds : 0));
        void element.play().then(() => { if (admitted()) setPlaying(true); else detach(); })
          .catch(() => { if (admitted()) fail("videoFailed"); else detach(); });
      } catch { fail("videoFailed"); }
    };
    const loaded = () => { if (admitted()) { metadata = true; start(); } };
    lifetime.dispose = cleanup;
    element.addEventListener("loadedmetadata", loaded);
    element.addEventListener("error", failed);
    if (expired()) { fail("expired"); return cleanup; }
    timer.value = setTimeout(() => fail("expired"), Math.min(2147483647, expiresAt - Date.now()));
    void (async () => {
      try {
        const { default: HlsPlayer } = await import("hls.js");
        if (!admitted()) return;
        if (expired()) { fail("expired"); return; }
        if (!data.url) { fail("videoFailed"); return; }
        if (HlsPlayer.isSupported()) {
          // The installed ESM build has no inline worker; keep this adapter asset-free.
          const hls = new HlsPlayer({ enableWorker: false, maxBufferLength: 20, backBufferLength: 0 });
          player = hls;
          const fatal = (_event: unknown, info: ErrorData) => { if (info.fatal) failed(); };
          const parsed = () => { if (admitted()) { manifest = true; start(); } };
          hls.on(HlsPlayer.Events.ERROR, fatal); hls.on(HlsPlayer.Events.MANIFEST_PARSED, parsed);
          removeHlsHandlers = () => { hls.off(HlsPlayer.Events.ERROR, fatal); hls.off(HlsPlayer.Events.MANIFEST_PARSED, parsed); };
          hls.loadSource(data.url); hls.attachMedia(element);
        } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
          manifest = true; element.preload = "metadata"; element.src = data.url; element.load();
        } else fail("unsupported");
      } catch { fail("videoFailed"); }
    })();
    return cleanup;
  }, [allowed, data, lifetime, onFailure, playbackAttempt, position]);
  return <div className="space-y-2"><video ref={media} controls playsInline preload="none" aria-label={copy.video}
    className="aspect-[4/3] w-full rounded-md bg-muted object-contain" />
    {!playing && <p role="status">{copy.loading}</p>}</div>;
}
