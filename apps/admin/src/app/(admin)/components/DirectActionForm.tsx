"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@auto-tm/ui/components";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

import {
  banListing,
  unbanListing,
  suspendUser,
  unsuspendUser,
} from "../actions";

import { useAdminTranslation, AdminText } from "@/lib/i18n";

interface DirectActionFormProps {
  actionType: "ban" | "unban" | "suspend" | "unsuspend";
  targetId: string;
}

export function DirectActionForm({ actionType, targetId }: DirectActionFormProps) {
  const t=useAdminTranslation();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Укажите причину (1–1000 символов).");
      return;
    }

    setError(null);
    setSuccess(false);

    startTransition(async () => {
      let result;
      switch (actionType) {
        case "ban":
          result = await banListing(targetId, trimmed);
          break;
        case "unban":
          result = await unbanListing(targetId, trimmed);
          break;
        case "suspend":
          result = await suspendUser(targetId, trimmed);
          break;
        case "unsuspend":
          result = await unsuspendUser(targetId, trimmed);
          break;
      }

      if (!result.ok) {
        const code = result.code;
        const details = (
          result.details as { details?: { reason?: string; targetState?: unknown } } | undefined
        )?.details;

        if (code === "CONFLICT" && details?.reason === "MODERATION_TARGET_STATE_CONFLICT") {
          setError("Состояние цели изменилось. Страница обновлена.");
        } else if (code === "FORBIDDEN" && details?.reason === "ADMIN_TARGET_NOT_MODERATABLE") {
          setError("Администраторов нельзя заблокировать.");
        } else if (code === "FORBIDDEN" && details?.reason === "SELF_MODERATION_NOT_ALLOWED") {
          setError("Нельзя применять действия к собственной учётной записи.");
        } else if (code === "FORBIDDEN" && details?.reason === "FEATURE_DISABLED") {
          setError("Действие временно недоступно.");
        } else {
          setError(result.error || "Не удалось выполнить действие.");
        }

        router.refresh();
        return;
      }

      setSuccess(true);
      setReason("");
      router.refresh();
    });
  };

  const label =
    actionType === "ban"
      ? "Заблокировать"
      : actionType === "unban"
      ? "Разблокировать"
      : actionType === "suspend"
      ? "Заблокировать"
      : "Разблокировать";

  const variant =
    actionType === "ban" || actionType === "suspend" ? "destructive" : "secondary";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor={`reason-${actionType}-${targetId}`} className="text-xs font-medium text-neutral-600"><AdminText>Причина действия</AdminText></label>
        <Input
          id={`reason-${actionType}-${targetId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("Обязательно: укажите причину...")}
          disabled={isPending}
          maxLength={1000}
          className="mt-1"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <AdminText>{error}</AdminText>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /><AdminText>Действие выполнено успешно.</AdminText></div>
      )}

      <Button type="submit" disabled={isPending} variant={variant}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /><AdminText>Обработка...</AdminText></>
        ) : (
          <AdminText>{label}</AdminText>
        )}
      </Button>
    </form>
  );
}
