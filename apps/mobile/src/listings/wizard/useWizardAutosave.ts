import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import NetInfo from "@react-native-community/netinfo";
import type { WizardSchemas } from "@auto-tm/contracts";

import { useUpdateDraft } from "../../api/listings/useUpdateDraft";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface DebouncedFn<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel?: () => void;
}

function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): DebouncedFn<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: TArgs) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff
const SAVE_TIMEOUT_MS = 10_000;

export function useWizardAutosave(draftId: string | undefined) {
  const { t } = useTranslation();
  const updateDraft = useUpdateDraft();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveStatusRef = useRef(saveStatus);

  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  const retryCountRef = useRef(0);
  const pendingPayloadRef = useRef<WizardSchemas.WizardDraftPayload | null>(
    null,
  );
  const lastSavedPayloadRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const isOnlineRef = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<boolean> | null>(null);
  // The draft this hook saves now. A save that finishes after the wizard moved
  // to another draft, or closed, must not touch the new draft's status.
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;

  // Track network status
  useEffect(() => {
    isMountedRef.current = true;
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? true;
      isOnlineRef.current = online;

      // If we came back online and have a pending save in error state, retry.
      // Go through the ref: this effect runs once, when there may be no draft yet.
      if (online && pendingPayloadRef.current && saveStatusRef.current === "error") {
        void performSaveRef.current(pendingPayloadRef.current);
      }
    });
    return () => {
      unsub();
      isMountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const clearSaveTimeout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  /**
   * Saves `payload`. Resolves true when the server holds it, false otherwise.
   * `once` makes a single attempt and reports a failure at once instead of
   * running the retry schedule, for a seller who is waiting to leave.
   */
  const savePayload = useCallback(
    async (
      payload: WizardSchemas.WizardDraftPayload,
      options: { once?: boolean } = {},
    ): Promise<boolean> => {
      if (!draftId || draftId.length === 0) return false;
      clearRetryTimeout();

      const payloadKey = JSON.stringify(payload);
      if (payloadKey === lastSavedPayloadRef.current) {
        // Already saved this exact payload — nothing to do
        pendingPayloadRef.current = null;
        clearSaveTimeout();
        setSaveStatus("saved");
        setSaveError(null);
        return true;
      }

      pendingPayloadRef.current = payload;
      setSaveStatus("saving");
      setSaveError(null);
      clearSaveTimeout();

      saveTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && saveStatusRef.current === "saving") {
          setSaveStatus("error");
          setSaveError(t("saveTimedOut"));
        }
      }, SAVE_TIMEOUT_MS);

      try {
        await updateDraft.mutateAsync({ draftId, payload });

        if (!isMountedRef.current || draftIdRef.current !== draftId) return false;

        clearSaveTimeout();
        retryCountRef.current = 0;
        pendingPayloadRef.current = null;
        lastSavedPayloadRef.current = payloadKey;
        setSaveStatus("saved");
        return true;
      } catch (err) {
        if (!isMountedRef.current || draftIdRef.current !== draftId) return false;
        clearSaveTimeout();

        const message =
          err instanceof Error ? err.message : t("failedToSaveDraft");

        const isNetworkError =
          !isOnlineRef.current ||
          (err instanceof Error &&
            "code" in err &&
            (err as { code: string }).code === "NETWORK_ERROR");

        if (isNetworkError) {
          setSaveStatus("error");
          setSaveError(t("noInternetWillRetry"));
          return false;
        }

        if (!options.once && retryCountRef.current < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCountRef.current] ?? 4000;
          retryCountRef.current += 1;

          setSaveStatus("saving");
          setSaveError(t("retryingCount", { current: retryCountRef.current, max: MAX_RETRIES }));

          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            if (isMountedRef.current && draftIdRef.current === draftId && pendingPayloadRef.current) {
              void performSaveRef.current(pendingPayloadRef.current, { retry: true });
            }
          }, delay);
        } else {
          retryCountRef.current = 0;
          setSaveStatus("error");
          setSaveError(message);
        }
        return false;
      }
    },
    [draftId, updateDraft, clearSaveTimeout, clearRetryTimeout, t],
  );

  const performSave = useCallback((
    payload: WizardSchemas.WizardDraftPayload,
    options: { once?: boolean; retry?: boolean } = {},
  ): Promise<boolean> => {
    const run = () => {
      if (!isMountedRef.current || draftIdRef.current !== draftId) return Promise.resolve(false);
      if (!options.retry) retryCountRef.current = 0;
      return savePayload(payload, options);
    };
    const previous = saveQueueRef.current;
    const queued = previous ? previous.then(run, run) : run();
    saveQueueRef.current = queued;
    const clearQueue = () => {
      if (saveQueueRef.current === queued) saveQueueRef.current = null;
    };
    void queued.then(clearQueue, clearQueue);
    return queued;
  }, [draftId, savePayload]);

  // Use a ref so the debounce closure always calls the current performSave
  // without needing to recreate the debounced function when performSave changes.
  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  const debouncedSave = useMemo(
    () =>
      debounce((payload: WizardSchemas.WizardDraftPayload) => {
        void performSaveRef.current(payload);
      }, 500),
    [], // never recreate — stable forever
  );

  // The next draft starts clean. The hook outlives each wizard session, so
  // without this a failed save, a pending retry payload or the last saved
  // payload of the draft the seller left would carry over to the next one.
  useEffect(() => {
    debouncedSave.cancel?.();
    clearSaveTimeout();
    clearRetryTimeout();
    pendingPayloadRef.current = null;
    saveQueueRef.current = null;
    lastSavedPayloadRef.current = null;
    retryCountRef.current = 0;
    setSaveStatus("idle");
    setSaveError(null);
  }, [draftId, debouncedSave, clearSaveTimeout, clearRetryTimeout]);

  const save = useCallback(
    (payload: WizardSchemas.WizardDraftPayload) => {
      pendingPayloadRef.current = payload;
      setSaveError(null);
      debouncedSave(payload);
    },
    [debouncedSave],
  );

  const forceSave = useCallback(
    async (payload: WizardSchemas.WizardDraftPayload): Promise<void> => {
      pendingPayloadRef.current = payload;
      debouncedSave.cancel?.();
      await performSave(payload);
    },
    [debouncedSave, performSave],
  );

  /**
   * Saves `payload` now, for a seller who is leaving: one attempt, no retry
   * schedule. Resolves true when the server holds it.
   */
  const flush = useCallback(
    (payload: WizardSchemas.WizardDraftPayload): Promise<boolean> => {
      pendingPayloadRef.current = payload;
      debouncedSave.cancel?.();
      return performSave(payload, { once: true });
    },
    [debouncedSave, performSave],
  );

  /** Drops a save that has not been sent, for a draft that is about to be deleted. */
  const discardPending = useCallback(() => {
    debouncedSave.cancel?.();
    clearRetryTimeout();
    pendingPayloadRef.current = null;
  }, [debouncedSave, clearRetryTimeout]);

  const retrySave = useCallback(() => {
    if (pendingPayloadRef.current) {
      void performSave(pendingPayloadRef.current);
    }
  }, [performSave]);

  return { save, forceSave, flush, discardPending, retrySave, saveStatus, saveError };
}
