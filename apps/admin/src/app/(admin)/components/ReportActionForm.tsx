"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@auto-tm/ui/components";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

import {
  dismissReport,
  banListing,
  suspendUser,
} from "../actions";

import { useAdminTranslation, AdminText } from "@/lib/i18n";

interface ReportActionFormProps {
  actionType: "dismiss" | "ban" | "suspend";
  reportId: string;
  targetType: string;
  targetId: string;
}

export function ReportActionForm({
  actionType,
  reportId,
  targetId,
}: ReportActionFormProps) {
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
        case "dismiss":
          result = await dismissReport(reportId, trimmed);
          break;
        case "ban":
          result = await banListing(targetId, trimmed, reportId);
          break;
        case "suspend":
          result = await suspendUser(targetId, trimmed, reportId);
          break;
      }

      if (!result.ok) {
        const code = result.code;
        const details = (
          result.details as { details?: { reason?: string; reportStatus?: string } } | undefined
        )?.details;

        if (code === "CONFLICT" && details?.reason === "REPORT_ALREADY_RESOLVED") {
          setError("Жалоба уже обработана другим администратором. Страница обновлена.");
        } else if (code === "CONFLICT" && details?.reason === "MODERATION_TARGET_STATE_CONFLICT") {
          setError("Состояние цели изменилось. Страница обновлена.");
        } else if (code === "CONFLICT" && details?.reason === "REPORT_TARGET_NOT_ACTIONABLE") {
          setError("Цель больше не доступна для действия. Страница обновлена.");
        } else if (code === "FORBIDDEN" && details?.reason === "ADMIN_TARGET_NOT_MODERATABLE") {
          setError("Администраторов нельзя заблокировать.");
        } else if (code === "FORBIDDEN" && details?.reason === "SELF_MODERATION_NOT_ALLOWED") {
          setError("Нельзя применять действия к собственной учётной записи.");
        } else if (code === "FORBIDDEN" && details?.reason === "FEATURE_DISABLED") {
          setError("Действие временно недоступно.");
        } else {
          setError(result.error || "Не удалось выполнить действие.");
        }

        // Refresh from server on any error
        router.refresh();
        return;
      }

      setSuccess(true);
      setReason("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor={`reason-${actionType}`} className="text-xs font-medium text-neutral-600"><AdminText>Причина действия</AdminText></label>
        <Input
          id={`reason-${actionType}`}
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

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} variant={actionType === "dismiss" ? "secondary" : "destructive"}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /><AdminText>Обработка...</AdminText></>
          ) : actionType === "dismiss" ? (
            <AdminText>Отклонить</AdminText>
          ) : actionType === "ban" ? (
            <AdminText>Заблокировать объявление</AdminText>
          ) : (
            <AdminText>Заблокировать пользователя</AdminText>
          )}
        </Button>
      </div>
    </form>
  );
}
