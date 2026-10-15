import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminSchemas, ErrorCode } from "@auto-tm/contracts";

import { listAuditEntries } from "../actions";

import { AdminText, AdminDate } from "@/lib/i18n";

const VALID_ACTIONS = Object.values(AdminSchemas.AdminAuditAction);


function actionLabel(action: string): string {
  const map: Record<string, string> = {
    ADMIN_BOOTSTRAP_PROMOTE: "Повышение до админа",
    LISTING_BAN: "Блокировка объявления",
    LISTING_UNBAN: "Разблокировка объявления",
    USER_SUSPEND: "Блокировка пользователя",
    USER_UNSUSPEND: "Разблокировка пользователя",
    USER_PHOTO_REMOVE: "Удаление фото профиля",
    CONTENT_REPORT_RESOLVE: "Обработка жалобы",
    REPORTED_MESSAGE_READ: "Просмотр сообщения по жалобе",
  };
  return map[action] ?? action;
}

function actionBadgeClass(action: string): string {
  switch (action) {
    case "LISTING_BAN":
    case "USER_SUSPEND":
      return "bg-error-500/10 text-error-500";
    case "LISTING_UNBAN":
    case "USER_UNSUSPEND":
      return "bg-success-500/10 text-success-500";
    case "CONTENT_REPORT_RESOLVE":
      return "bg-info-500/10 text-info-500";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

function recordPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "записи";
  return "записей";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const action = typeof params["action"] === "string" ? params["action"] : undefined;
  const targetType = typeof params["targetType"] === "string" ? params["targetType"] : undefined;
  const targetId = typeof params["targetId"] === "string" ? params["targetId"] : undefined;
  const page = typeof params["page"] === "string" ? Number(params["page"]) : 1;
  const pageSize = typeof params["pageSize"] === "string" ? Number(params["pageSize"]) : 50;

  // Validate filters; reset to default on invalid
  if (action && !VALID_ACTIONS.includes(action as AdminSchemas.AdminAuditAction)) {
    redirect("/audit");
  }

  const listParams: { action?: string; targetType?: string; targetId?: string; page: number; pageSize: number } = {
    page,
    pageSize: Math.min(Math.max(pageSize, 10), 100),
  };
  if (action) listParams.action = action;
  if (targetType) listParams.targetType = targetType;
  if (targetId) listParams.targetId = targetId;

  const result = await listAuditEntries(listParams);

  if (!result.ok && result.code === ErrorCode.ValidationFailed) {
    redirect("/audit");
  }

  const data = result.ok ? result.data : null;
  const items: AdminSchemas.AuditLogListItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.page ?? 1;

  function buildHref(p: {
    action?: string;
    targetType?: string;
    targetId?: string;
    page?: number;
  }): string {
    const sp = new URLSearchParams();
    if (p.action !== undefined ? p.action : action)
      sp.set("action", (p.action !== undefined ? p.action : action) as string);
    if (p.targetType !== undefined ? p.targetType : targetType)
      sp.set("targetType", (p.targetType !== undefined ? p.targetType : targetType) as string);
    if (p.targetId !== undefined ? p.targetId : targetId)
      sp.set("targetId", (p.targetId !== undefined ? p.targetId : targetId) as string);
    if ((p.page ?? currentPage) > 1) sp.set("page", String(p.page ?? currentPage));
    const qs = sp.toString();
    return `/audit${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold"><AdminText>Аудит действий</AdminText></h1>
          <p className="text-sm text-neutral-500">
            {total} <AdminText>{recordPlural(total)}</AdminText>
          </p>
        </div>
        <form
          method="GET"
          action="/audit"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="action" className="text-xs font-medium text-neutral-600"><AdminText>Действие</AdminText></label>
            <select
              id="action"
              name="action"
              defaultValue={action ?? ""}
              className="h-9 rounded-md border bg-surface px-2 text-sm"
            >
              <option value=""><AdminText>Все</AdminText></option>
              {VALID_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  <AdminText>{actionLabel(a)}</AdminText>
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="targetType" className="text-xs font-medium text-neutral-600"><AdminText>Тип цели</AdminText></label>
            <select
              id="targetType"
              name="targetType"
              defaultValue={targetType ?? ""}
              className="h-9 rounded-md border bg-surface px-2 text-sm"
            >
              <option value=""><AdminText>Все</AdminText></option>
              <option value="listing"><AdminText>Объявление</AdminText></option>
              <option value="user"><AdminText>Пользователь</AdminText></option>
              <option value="content_report"><AdminText>Жалоба</AdminText></option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="targetId" className="text-xs font-medium text-neutral-600"><AdminText>ID цели</AdminText></label>
            <input
              id="targetId"
              name="targetId"
              type="text"
              defaultValue={targetId ?? ""}
              placeholder="uuid"
              className="h-9 rounded-md border bg-surface px-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600"
          ><AdminText>Применить</AdminText></button>
        </form>
      </div>

      {!result.ok ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AdminText>{result.error}</AdminText>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border bg-surface p-8 text-center text-neutral-500">
          <p className="text-lg font-medium"><AdminText>Нет записей</AdminText></p>
          <p className="mt-1 text-sm"><AdminText>По выбранным фильтрам аудит пуст.</AdminText></p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3 font-medium"><AdminText>Дата</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Действие</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Администратор</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Тип цели</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Цель</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Причина</AdminText></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                      <AdminDate value={item.createdAt} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClass(item.action)}`}
                      >
                        <AdminText>{actionLabel(item.action)}</AdminText>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.actorSummary.id ? (
                        <span>{item.actorSummary.label}</span>
                      ) : (
                        <span className="italic text-neutral-400">{item.actorSummary.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AdminText>{item.targetType === "listing"
                        ? "Объявление"
                        : item.targetType === "user"
                        ? "Пользователь"
                        : item.targetType === "content_report"
                        ? "Жалоба"
                        : item.targetType}</AdminText>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={
                          item.targetType === "listing"
                            ? `/listings/${item.targetId}`
                            : item.targetType === "user"
                            ? `/users/${item.targetId}`
                            : `/reports/${item.targetId}`
                        }
                        className="text-brand-600 hover:underline"
                      >
                        {item.targetLabel ?? item.targetId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-neutral-500">
                      {item.reasonPreview ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-neutral-500"><AdminText>Страница</AdminText>{currentPage}<AdminText>из</AdminText>{totalPages}
              </div>
              <div className="flex gap-2">
                {currentPage > 1 && (
                  <Link
                    href={buildHref({ page: currentPage - 1 })}
                    className="rounded-md border bg-surface px-3 py-1.5 text-sm hover:bg-neutral-50"
                  ><AdminText>Назад</AdminText></Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={buildHref({ page: currentPage + 1 })}
                    className="rounded-md border bg-surface px-3 py-1.5 text-sm hover:bg-neutral-50"
                  ><AdminText>Вперёд</AdminText></Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
