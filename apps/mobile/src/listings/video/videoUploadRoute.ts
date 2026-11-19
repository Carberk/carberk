import { apiRouteHeaders, captureRouteSnapshot, type RouteSnapshot } from "../../api/routes";

const VIDEO_ORIGIN = "https://t3.storageapi.dev";
const VIDEO_ALIAS = "https://tm-staging.bagtyyar.dev/video-uploads";

export async function videoUploadRequest(uri: string, route: RouteSnapshot = captureRouteSnapshot()): Promise<{ uri: string; headers: Record<string, string> }> {
  if (route.entry === "global") return { uri, headers: {} };
  if (!uri.startsWith(`${VIDEO_ORIGIN}/`) || !/^\/[a-z0-9.-]+\/video-sources\/[0-9a-f-]{36}\/source\.mp4\?/.test(uri.slice(VIDEO_ORIGIN.length))) {
    throw new Error("Unapproved video upload destination");
  }
  return { uri: VIDEO_ALIAS + uri.slice(VIDEO_ORIGIN.length), headers: await apiRouteHeaders(route) };
}
