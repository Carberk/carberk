import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image as ExpoImage, type ImageProps, type ImageSource } from "expo-image";
import { cssInterop } from "nativewind";

import { captureRouteSnapshot, photoRouteHeaders, subscribePhotoRoute, photoRouteRevision, type RouteSnapshot } from "../api/routes";

const PHOTO_ORIGIN = "https://minio-staging-5795.up.railway.app";
const PHOTO_ALIAS = "https://tm-staging.bagtyyar.dev/photos";
const knownPhoto = (uri: string) => uri.startsWith(`${PHOTO_ORIGIN}/`) && /^\/(listing-photos|chat-attachments)\//.test(uri.slice(PHOTO_ORIGIN.length));

function storageHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !/^(authorization|cookie|x-carberk-.*)$/i.test(name)));
}

export async function photoRequest(uri: string, headers: Record<string, string> = {}, route = captureRouteSnapshot()): Promise<{ uri: string; headers: Record<string, string> }> {
  const safeHeaders = storageHeaders(headers);
  if (route.entry === "global") return { uri, headers: safeHeaders };
  if (!knownPhoto(uri)) throw new Error("Unapproved photo destination");
  const target = PHOTO_ALIAS + uri.slice(PHOTO_ORIGIN.length);
  return { uri: target, headers: { ...safeHeaders, ...await photoRouteHeaders(route, target) } };
}

function usePhotoSource(source: ImageProps["source"], route: RouteSnapshot, revision: number): ImageProps["source"] {
  const { entry, generation, apiBaseUrl } = route;
  const object = typeof source === "object" && source !== null && !Array.isArray(source) && "uri" in source ? source as ImageSource : undefined;
  const uri = typeof source === "string" ? source : object?.uri;
  const routed = Boolean(uri && knownPhoto(uri) && route.entry === "tm");
  const signature = JSON.stringify(object?.headers ?? {});
  const [ready, setReady] = useState<{ uri: string; revision: number; source: ImageSource }>();
  useEffect(() => {
    if (!uri || !routed) return;
    let current = true;
    void photoRequest(uri, JSON.parse(signature) as Record<string, string>, { entry, generation, apiBaseUrl }).then(request => {
      if (current) setReady({ uri, revision, source: { ...request, cacheKey: object?.cacheKey ?? uri } });
    }).catch(() => {});
    return () => { current = false; };
  }, [uri, routed, entry, generation, apiBaseUrl, signature, object?.cacheKey, revision]);
  if (!uri) return source;
  if (!knownPhoto(uri)) return object?.headers ? { ...object, headers: storageHeaders(object.headers) } : source;
  if (routed) return ready?.uri === uri && ready.revision === revision ? { ...object, ...ready.source } : undefined;
  return { ...object, uri, ...(object?.headers ? { headers: storageHeaders(object.headers) } : {}) };
}

function usePhotoRevision() { return useSyncExternalStore(subscribePhotoRoute, photoRouteRevision); }

export function usePhotoFailure(uri: string | null | undefined) {
  const failureKey = `${usePhotoRevision()}:${uri}`;
  const activePhoto = useRef(failureKey);
  activePhoto.current = failureKey;
  const [failedAt, setFailedAt] = useState<string>();
  return {
    failed: failedAt === failureKey,
    onError: () => {
      if (activePhoto.current === failureKey) setFailedAt(failureKey);
    },
  };
}

export function Photo({ source, placeholder, ...props }: ImageProps & { className?: string }) {
  const revision = usePhotoRevision();
  const route = captureRouteSnapshot();
  const mappedSource = usePhotoSource(source, route, revision);
  const mappedPlaceholder = usePhotoSource(placeholder, route, revision);
  return <ExpoImage {...props} source={mappedSource} placeholder={mappedPlaceholder} />;
}
cssInterop(Photo, { className: "style" });
