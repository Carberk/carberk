import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSchemas, Enums, ErrorCode, UploadsSchemas } from "@auto-tm/contracts";

import { getReportDetail, getConfig } from "../../actions";
import { UserReportPhoto } from "../../components/UserReportPhoto";
import { RemovePhotoForm } from "../../components/RemovePhotoForm";
import { ReportActionForm } from "../../components/ReportActionForm";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    spam: "Спам",
    scam: "Мошенничество",
    misleading: "Вводит в заблуждение",
    wrong_category: "Неверная категория",
    harassment: "Домогательство",
    other: "Другое",
  };
  return map[reason] ?? reason;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "В ожидании",
    actioned: "Обработана",
    dismissed: "Отклонена",
  };
  return map[status] ?? status;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "actioned":
      return "bg-green-100 text-green-800";
    case "dismissed":
      return "bg-neutral-100 text-neutral-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getReportDetail(id);
  const configResult = await getConfig();

  if (!result.ok && result.code === ErrorCode.NotFound) {
    notFound();
  }

  if (!result.ok) {
    return (
      <div className="p-6 md:p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {result.error}
        </div>
        <div className="mt-4">
          <Link href="/reports" className="text-brand-600 hover:underline text-sm">
            ← Назад к очереди
          </Link>
        </div>
      </div>
    );
  }

  const report = result.data;
  const isPending = report.status === AdminSchemas.ContentReportStatus.Pending;
  const moderationEnabled = configResult.ok && configResult.data.adminModerationActionsEnabled;

  // Dynamic access keeps this server-only value out of Next's build-time public env replacement.
  const runtimeMediaOrigin = Reflect.get(process.env, "NEXT_PUBLIC_MINIO_PUBLIC_URL") as string | undefined;
  const mediaOrigin = (runtimeMediaOrigin ?? "").trim().replace(/\/$/, "");
  const photoBaseKey = report.target.avatarKey?.replace(/\/original\.(jpg|webp|jpeg)$/, "");
  const photoUrl = mediaOrigin && photoBaseKey
    ? `${mediaOrigin}/listing-photos/${photoBaseKey}/thumbnail.webp?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}`
    : undefined;

  const canRemovePhoto = configResult.ok && moderationEnabled &&
    report.target.available && report.target.role !== Enums.UserRole.Admin && Boolean(photoUrl);

  // Determine actionable state
  const isListing = report.target.targetType === "listing";
  const isUser = report.target.targetType === "user";
  const isMessage = report.target.targetType === "message";
  const suspensionTarget = isMessage ? report.target.sender?.userId : report.target.targetId;
  const suspensionRole = isMessage ? report.target.sender?.role : report.target.role;
  const suspensionAvailable = isMessage ? report.target.sender?.available : report.target.available;

  // For listings: ban is available when status is active
  const canBan =
    isListing &&
    report.targetModerationState?.status === Enums.ListingStatus.Active;

  // For users: suspend is available when not already suspended and not admin
  const canSuspend =
    (isUser || isMessage) && suspensionAvailable && !!suspensionTarget &&
    !report.targetModerationState?.suspendedAt &&
    suspensionRole !== Enums.UserRole.Admin;

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/reports" className="text-brand-600 hover:underline text-sm">
          ← Назад к очереди
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Жалоба {id.slice(0, 8)}</h1>
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(report.status)}`}
            >
              {statusLabel(report.status)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Reporter info */}
        <div className="rounded-md border bg-surface p-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
            Жалоба подана
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-neutral-500">Автор жалобы:</span>{" "}
              {report.reporter.available ? (
                <span>{report.reporter.label}</span>
              ) : (
                <span className="italic text-neutral-400">{report.reporter.label}</span>
              )}
            </div>
            <div>
              <span className="text-neutral-500">Причина:</span>{" "}
              {reasonLabel(report.reason)}
            </div>
            {report.details && (
              <div className="mt-2 rounded-md bg-neutral-50 p-3 whitespace-pre-wrap text-neutral-700">
                {report.details}
              </div>
            )}
            <div>
              <span className="text-neutral-500">Дата:</span>{" "}
              {formatDate(report.createdAt)}
            </div>
            {report.reportsSubmittedByReporterCount !== undefined && (
              <div>
                <span className="text-neutral-500">Всего жалоб от отправителя:</span>{" "}
                {report.reportsSubmittedByReporterCount}
              </div>
            )}
          </div>
        </div>

        {/* Target info */}
        <div className="rounded-md border bg-surface p-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
            Цель жалобы
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-neutral-500">Тип:</span>{" "}
              {isListing ? "Объявление" : isMessage ? "Сообщение" : "Пользователь"}
            </div>
            <div>
              <span className="text-neutral-500">Название:</span>{" "}
              {report.target.available ? (
                <span>{report.target.label}</span>
              ) : (
                <span className="italic text-neutral-400">{report.target.label}</span>
              )}
            </div>
            {isMessage && (
              <>
                {report.target.messageBody !== undefined && (
                  <div className="rounded-md bg-neutral-50 p-3 whitespace-pre-wrap break-words text-neutral-700">
                    {report.target.messageBody}
                  </div>
                )}
                {report.target.messageHasAttachment && <p>Есть вложение</p>}
                {report.target.messageCreatedAt && <div><span className="text-neutral-500">Отправлено:</span>{" "}{formatDate(report.target.messageCreatedAt)}</div>}
                <div>
                  <span className="text-neutral-500">Автор сообщения:</span>{" "}
                  {report.target.sender?.available && report.target.sender.userId ? (
                    <Link href={`/users/${report.target.sender.userId}`} className="text-brand-600 hover:underline">{report.target.sender.label}</Link>
                  ) : <span className="italic text-neutral-400">Пользователь удалён</span>}
                </div>
              </>
            )}
            {isListing && report.target.status && (
              <div>
                <span className="text-neutral-500">Статус объявления:</span>{" "}
                {report.target.status}
              </div>
            )}
            {isUser && report.target.available && (
              <UserReportPhoto
                key={id}
                hasPhoto={Boolean(report.target.avatarKey)}
                photoUrl={photoUrl}
                avatarIndex={report.target.avatarIndex}
              />
            )}
            {isUser && report.target.role && (
              <div>
                <span className="text-neutral-500">Роль:</span>{" "}
                {report.target.role}
              </div>
            )}
            {report.targetModerationState?.suspendedAt && (
              <div className="text-error-500">
                Пользователь заблокирован
              </div>
            )}
            <div>
              <span className="text-neutral-500">Жалоб на цель в ожидании:</span>{" "}
              {report.pendingReportsOnTargetCount}
            </div>
            {!isMessage && <div className="pt-2">
              <Link
                href={isListing ? `/listings/${report.target.targetId}` : `/users/${report.target.targetId}`}
                className="text-brand-600 hover:underline text-sm"
              >
                Перейти к действиям →
              </Link>
            </div>}
          </div>
        </div>
      </div>

      {/* Reviewer info */}
      {report.reviewer && (
        <div className="mt-6 rounded-md border bg-surface p-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
            Обработка
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-neutral-500">Обработал:</span>{" "}
              {report.reviewer.available ? report.reviewer.label : (
                <span className="italic text-neutral-400">{report.reviewer.label}</span>
              )}
            </div>
            {report.reviewedAt && (
              <div>
                <span className="text-neutral-500">Дата обработки:</span>{" "}
                {formatDate(report.reviewedAt)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action forms */}
      {isPending && moderationEnabled && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Действия</h2>

          {/* Dismiss */}
          <div className="rounded-md border bg-surface p-4">
            <h3 className="text-sm font-medium mb-2">Отклонить жалобу</h3>
            <p className="text-xs text-neutral-500 mb-3">
              Жалоба будет закрыта без изменения состояния цели.
            </p>
            <ReportActionForm
              actionType="dismiss"
              reportId={id}
              targetType={report.target.targetType}
              targetId={report.target.targetId}
            />
          </div>

          {/* Ban (listing only) */}
          {isListing && (
            <div className="rounded-md border bg-surface p-4">
              <h3 className="text-sm font-medium mb-2">Заблокировать объявление</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Объявление будет скрыто из публичного доступа. Новые сообщения и контакты будут заблокированы.
              </p>
              {canBan ? (
                <ReportActionForm
                  actionType="ban"
                  reportId={id}
                  targetType={report.target.targetType}
                  targetId={report.target.targetId}
                />
              ) : (
                <p className="text-sm text-neutral-400 italic">
                  Объявление уже неактивно или недоступно для блокировки.
                </p>
              )}
            </div>
          )}

          {isUser && report.target.avatarKey && canRemovePhoto && (
            <div className="rounded-md border bg-surface p-4">
              <h3 className="text-sm font-medium mb-2">Удалить фото профиля</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Фото будет удалено, и снова появится назначенный аватар. Жалоба будет обработана.
              </p>
              <RemovePhotoForm reportId={id} targetId={report.target.targetId} />
            </div>
          )}

          {/* Suspend a User or reported Message sender */}
          {(isUser || isMessage) && (
            <div className="rounded-md border bg-surface p-4">
              <h3 className="text-sm font-medium mb-2">{isMessage ? "Заблокировать автора сообщения" : "Заблокировать пользователя"}</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Пользователь не сможет создавать объявления, отправлять сообщения или совершать другие действия.
              </p>
              {canSuspend && suspensionTarget ? (
                <ReportActionForm
                  actionType="suspend"
                  reportId={id}
                  targetType="user"
                  targetId={suspensionTarget}
                />
              ) : suspensionRole === Enums.UserRole.Admin ? (
                <p className="text-sm text-neutral-400 italic">
                  Администраторов нельзя заблокировать через очередь жалоб.
                </p>
              ) : (
                <p className="text-sm text-neutral-400 italic">
                  Пользователь уже заблокирован или недоступен для блокировки.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isPending && !moderationEnabled && (
        <div className="mt-6 rounded-md border bg-surface p-4">
          <p className="text-sm text-neutral-500">
            Действия модерации временно недоступны.
          </p>
        </div>
      )}
    </div>
  );
}
