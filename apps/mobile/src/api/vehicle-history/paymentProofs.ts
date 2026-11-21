import * as FileSystem from "expo-file-system/legacy";
import { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";

import { accessTokenForRoute, apiClient, ApiError } from "../client";
import { apiRouteHeaders, captureRouteSnapshot } from "../routes";
import { assertHistorySession, type HistoryViewer } from "../../vehicle-history/session";

export function historyPaymentProofs(viewer: HistoryViewer, requestId: string, signal: AbortSignal, current: () => boolean) {
  const route = captureRouteSnapshot();
  const path = `/vehicle-history/requests/${encodeURIComponent(requestId)}/payment-proofs`;
  const assertSession = async () => {
    await assertHistorySession(viewer, signal);
    const latest = captureRouteSnapshot();
    if (!current() || latest.apiBaseUrl !== route.apiBaseUrl || latest.generation !== route.generation) throw new ApiError("HISTORY_READER_CHANGED", 409);
  };
  const options = { assertSession, signal };
  return {
    async list() {
      const result = await apiClient.get(path, P.PaymentProofsSchema, options);
      await assertSession();
      if (result.items.some((file) => file.orderId !== requestId)) throw new ApiError("CONTRACT_VIOLATION", 502);
      return result;
    },
    stage: (input: P.StagePaymentProof) => apiClient.post(path, input, P.PaymentProofSchema, options),
    submit: (file: P.PaymentProof) => apiClient.post(`${path}/${file.id}/submit`, { orderId: file.orderId }, P.PaymentProofSchema, options),
    async read(id: string) {
      const result = await apiClient.get(`${path}/${id}/content`, P.ReadPaymentProofSchema, options);
      await assertSession();
      if (result.file.id !== id || result.file.orderId !== requestId) throw new ApiError("CONTRACT_VIOLATION", 502);
      return result;
    },
    discard: (id: string) => apiClient.delete(`${path}/${id}`, P.PaymentProofSchema, options),
    async upload(file: P.PaymentProof, uri: string, progress: (percent: number) => void) {
      await assertSession();
      const token = await accessTokenForRoute(route);
      const routeHeaders = await apiRouteHeaders(route);
      await assertSession();
      if (!token) throw new ApiError("UNAUTHENTICATED", 401);
      let reject!: (error: ApiError) => void;
      const interrupted = new Promise<never>((_, fail) => { reject = fail; });
      let sending = true;
      let last = 0;
      const task = FileSystem.createUploadTask(`${route.apiBaseUrl}${path}/${file.id}/content`, uri, {
        httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
        headers: { ...routeHeaders, Authorization: `Bearer ${token}`, "Content-Type": file.contentType },
      }, ({ totalBytesSent, totalBytesExpectedToSend }) => {
        if (!sending || signal.aborted || !current() || totalBytesExpectedToSend <= 0) return;
        last = Math.max(last, Math.min(100, Math.floor(totalBytesSent * 100 / totalBytesExpectedToSend)));
        progress(last);
      });
      const abort = () => { sending = false; void task.cancelAsync().catch(() => undefined); reject(new ApiError("NETWORK_ERROR", 0)); };
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 60_000);
      try {
        if (signal.aborted) throw new ApiError("NETWORK_ERROR", 0);
        const response = await Promise.race([task.uploadAsync(), interrupted]);
        await assertSession();
        if (!response || response.status < 200 || response.status >= 300) {
          let code = "HISTORY_PROOF_UNAVAILABLE";
          try { const body: unknown = JSON.parse(response?.body ?? "");
            if (body && typeof body === "object" && "code" in body && typeof body.code === "string") code = body.code;
          } catch { code = "HISTORY_PROOF_UNAVAILABLE"; }
          throw new ApiError(code, response?.status ?? 0);
        }
        const parsed = P.PaymentProofSchema.safeParse(JSON.parse(response.body));
        if (!parsed.success || parsed.data.id !== file.id || parsed.data.orderId !== file.orderId) throw new ApiError("CONTRACT_VIOLATION", 502);
        return parsed.data;
      } finally { sending = false; clearTimeout(timer); signal.removeEventListener("abort", abort); }
    },
  };
}
