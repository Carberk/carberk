"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import type HlsPlayerInstance from "hls.js";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { playListingVideo, type ActionResult } from "../actions";

const statuses: Record<string, string> = { none: "Видео не добавлено", uploading: "Загружается", processing: "Обрабатывается", failed: "Не удалось обработать", ready: "Готово" };

export function ListingVideo({ listingId, result }: { listingId: string; result: ActionResult<ListingsSchemas.VideoAccessResponse> }) {
  const media = useRef<HTMLVideoElement>(null);
  const hls = useRef<HlsPlayerInstance | null>(null);
  const position = useRef(0);
  const attempt = useRef(0);
  const [state, setState] = useState<"cover" | "loading" | "playing" | "error">("cover");
  const [error, setError] = useState("");
  const data = result.ok ? result.data : undefined;
  const video = data?.video;
  const stop = () => {
    attempt.current += 1;
    const element = media.current;
    if (element && element.readyState > 0) position.current = element.currentTime;
    hls.current?.destroy(); hls.current = null;
    if (element) { element.onloadedmetadata = null; element.pause(); element.removeAttribute("src"); element.load(); }
  };
  useEffect(() => {
    const hide = () => { if (document.hidden) { stop(); setState("cover"); } };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stop(); };
  }, []);

  async function play() {
    stop();
    const current = attempt.current;
    setState("loading"); setError("");
    try {
      const response = await playListingVideo(listingId);
      if (current !== attempt.current) return;
      if (!response.ok || !response.data.url) throw new Error("unavailable");
      const element = media.current;
      if (!element) return;
      const fail = () => { if (current === attempt.current) { stop(); setError("Не удалось воспроизвести видео. Проверьте соединение и попробуйте снова."); setState("error"); } };
      const start = () => { element.currentTime = position.current; void element.play().then(() => { if (current === attempt.current) setState("playing"); }).catch(fail); };
      const { default: HlsPlayer } = await import("hls.js");
      if (current !== attempt.current) return;
      if (HlsPlayer.isSupported()) {
        const player = new HlsPlayer({ maxBufferLength: 20, backBufferLength: 0 }); hls.current = player;
        player.on(HlsPlayer.Events.ERROR, (_event, info) => { if (info.fatal) fail(); });
        player.on(HlsPlayer.Events.MANIFEST_PARSED, start);
        player.loadSource(response.data.url); player.attachMedia(element);
      } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.onloadedmetadata = start; element.src = response.data.url;
      } else { fail(); }
    } catch { if (current === attempt.current) { setError("Видео недоступно. Обновите страницу или попробуйте снова."); setState("error"); } }
  }

  return <section className="mb-6 border-b pb-6" aria-labelledby="listing-video-title">
    <h2 id="listing-video-title" className="text-lg font-semibold mb-2">Видео объявления</h2>
    {!result.ok ? <p role="alert" className="text-sm text-red-700">Не удалось проверить видео. Обновите страницу, чтобы повторить.</p> : <>
      <p className="text-sm text-neutral-600 mb-3">{statuses[data?.status ?? "none"]}{data?.pendingStatus ? ` · Замена: ${statuses[data.pendingStatus]}` : ""}</p>
      {video && <>
        <p className="text-sm text-neutral-600 mb-2">Длительность: {Math.floor(video.durationMs / 60_000)}:{String(Math.floor(video.durationMs / 1000) % 60).padStart(2, "0")}</p>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-neutral-950">
          {state === "cover" && <>
            {/* Private grant bypasses the shared Next image optimizer. */}
            <img src={video.cover.detail} alt="Обложка видео объявления" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            <button onClick={() => void play()} aria-label="Смотреть видео" className="absolute inset-0 flex items-center justify-center gap-2 bg-black/20 text-white font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white hover:bg-black/30"><span className="flex items-center gap-2 rounded-full bg-neutral-950/90 px-4 py-3"><Play aria-hidden="true" />Смотреть видео</span></button>
          </>}
          <video ref={media} controls playsInline preload="none" onError={() => { stop(); setError("Не удалось воспроизвести видео. Попробуйте снова."); setState("error"); }} className={`h-full w-full object-contain ${state === "cover" ? "hidden" : ""}`} aria-label="Видео объявления" />
          {state === "loading" && <p role="status" className="absolute inset-x-0 top-4 text-center text-white">Загрузка видео…</p>}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {state === "error" && <button onClick={() => void play()} className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Попробовать снова</button>}
        {state !== "cover" && <button onClick={() => { stop(); setState("cover"); }} className="mt-3 ml-3 text-sm text-brand-600 hover:underline">Закрыть видео</button>}
      </>}
    </>}
  </section>;
}
