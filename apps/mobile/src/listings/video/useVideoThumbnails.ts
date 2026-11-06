import { useEffect, useState } from "react";
import * as VideoThumbnails from "expo-video-thumbnails";

/** Real frames via expo-video-thumbnails; empty slots while loading/failed. */
export function useVideoThumbnails(uri: string, timesS: number[]): (string | null)[] {
  const [uris, setUris] = useState<(string | null)[]>(() => timesS.map(() => null));
  const key = `${uri}|${timesS.join(",")}`;
  useEffect(() => {
    let alive = true;
    setUris(timesS.map(() => null));
    timesS.forEach((timeS, i) => {
      VideoThumbnails.getThumbnailAsync(uri, { time: Math.round(timeS * 1000), quality: 0.7 })
        .then((r) => { if (alive) setUris((p) => { const n = [...p]; n[i] = r.uri; return n; }); })
        .catch(() => undefined);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return uris;
}
