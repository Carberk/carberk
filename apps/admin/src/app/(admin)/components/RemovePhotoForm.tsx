"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@auto-tm/ui/components";

import { removeUserPhoto } from "../actions";

import { useAdminTranslation, AdminText } from "@/lib/i18n";

interface RemovePhotoFormProps {
  reportId: string;
  targetId: string;
}

export function RemovePhotoForm({ reportId, targetId }: RemovePhotoFormProps) {
  const t=useAdminTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Укажите причину (1–1000 символов).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeUserPhoto(targetId, trimmed, reportId);
      if (!result.ok) {
        const details = (result.details as { details?: { reason?: string } } | undefined)?.details;
        const conflictErrors: Record<string, string> = {
          REPORT_ALREADY_RESOLVED: "Жалоба уже обработана другим администратором. Обновите страницу.",
          MODERATION_TARGET_STATE_CONFLICT: "Состояние цели изменилось. Обновите страницу.",
          REPORT_TARGET_NOT_ACTIONABLE: "Цель больше не доступна для действия. Обновите страницу.",
        };
        const forbiddenErrors: Record<string, string> = {
          ADMIN_TARGET_NOT_MODERATABLE: "Фото администраторов нельзя удалять.",
          SELF_MODERATION_NOT_ALLOWED: "Нельзя применять действия к собственной учётной записи.",
          FEATURE_DISABLED: "Действие временно недоступно.",
        };
        const message = result.code === "CONFLICT"
          ? conflictErrors[details?.reason ?? ""]
          : result.code === "FORBIDDEN" ? forbiddenErrors[details?.reason ?? ""] : undefined;
        setError(message ?? "Не удалось выполнить действие.");
        // Retain the failed-action feedback. Refreshing a resolved report would
        // unmount this form and erase its alert; the moderator can reload manually.
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  if (success) {
    return <p role="status" className="text-sm text-green-700"><AdminText>Фото удалено.</AdminText></p>;
  }

  if (!confirming) {
    return <Button variant="destructive" onClick={() => setConfirming(true)}><AdminText>Удалить фото</AdminText></Button>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm"><AdminText>Удалить фото профиля и обработать жалобу?</AdminText></p>
      <div>
        <label htmlFor="reason-remove-photo" className="text-xs font-medium text-neutral-600"><AdminText>Причина действия</AdminText></label>
        <Input
          id="reason-remove-photo"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("Обязательно: укажите причину...")}
          disabled={isPending}
          maxLength={1000}
          className="mt-1"
        />
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700"><AdminText>{error}</AdminText></p>}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={isPending}>
          <AdminText>{isPending ? "Обработка..." : "Подтвердить удаление"}</AdminText>
        </Button>
        <Button type="button" variant="secondary" disabled={isPending} onClick={() => {
          setConfirming(false);
          setReason("");
          setError(null);
        }}><AdminText>Отмена</AdminText></Button>
      </div>
    </form>
  );
}
