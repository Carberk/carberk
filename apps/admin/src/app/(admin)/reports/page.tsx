import { redirect } from "next/navigation";
import Link from "next/link";
import { ErrorCode } from "@auto-tm/contracts";
import type { AdminSchemas } from "@auto-tm/contracts";

import { listReports } from "../actions";

import { AdminText, AdminDate } from "@/lib/i18n";

const VALID_STATUSES = ["pending", "actioned", "dismissed"];
const VALID_TARGET_TYPES = ["listing", "user", "message"];
const DEFAULT_STATUS = "pending";


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

function reportPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "жалоба";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "жалобы";
  return "жалоб";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const status = typeof params["status"] === "string" ? params["status"] : DEFAULT_STATUS;
  const targetType =
    typeof params["targetType"] === "string" ? params["targetType"] : undefined;
  const page =
    typeof params["page"] === "string" ? Number(params["page"]) : 1;
  const pageSize =
    typeof params["pageSize"] === "string" ? Number(params["pageSize"]) : 50;

  // Validate filters; reset to default on invalid
  if (status && !VALID_STATUSES.includes(status)) {
    redirect("/reports");
  }
  if (targetType && !VALID_TARGET_TYPES.includes(targetType)) {
    redirect("/reports");
  }

  const listParams: { status: string; targetType?: string; page: number; pageSize: number } = {
    status,
    page,
    pageSize: Math.min(Math.max(pageSize, 10), 100),
  };
  if (targetType) {
    listParams.targetType = targetType;
  }

  const result = await listReports(listParams);

  if (!result.ok && result.code === ErrorCode.ValidationFailed) {
    redirect("/reports");
  }

  const data = result.ok ? result.data : null;
  const items: AdminSchemas.ReportListItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.page ?? 1;

  function buildHref(p: { status?: string; targetType?: string; page?: number }): string {
    const sp = new URLSearchParams();
    sp.set("status", p.status ?? status);
    if (p.targetType !== undefined ? p.targetType : targetType) {
      sp.set("targetType", (p.targetType !== undefined ? p.targetType : targetType) as string);
    }
    if ((p.page ?? currentPage) > 1) {
      sp.set("page", String(p.page ?? currentPage));
    }
    const qs = sp.toString();
    return `/reports${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold"><AdminText>Очередь жалоб</AdminText></h1>
          <p className="text-sm text-neutral-500">
            {total} <AdminText>{reportPlural(total)}</AdminText>
          </p>
        </div>
        <form
          method="GET"
          action="/reports"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-xs font-medium text-neutral-600"><AdminText>Статус</AdminText></label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="h-9 rounded-md border bg-surface px-2 text-sm"
            >
              <option value="pending"><AdminText>В ожидании</AdminText></option>
              <option value="actioned"><AdminText>Обработаны</AdminText></option>
              <option value="dismissed"><AdminText>Отклонены</AdminText></option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="targetType" className="text-xs font-medium text-neutral-600"><AdminText>Тип</AdminText></label>
            <select
              id="targetType"
              name="targetType"
              defaultValue={targetType ?? ""}
              className="h-9 rounded-md border bg-surface px-2 text-sm"
            >
              <option value=""><AdminText>Все</AdminText></option>
              <option value="listing"><AdminText>Объявление</AdminText></option>
              <option value="user"><AdminText>Пользователь</AdminText></option>
              <option value="message"><AdminText>Сообщение</AdminText></option>
            </select>
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
          {status === "pending" ? (
            <>
              <p className="text-lg font-medium"><AdminText>Очередь пуста 🎉</AdminText></p>
              <p className="mt-1 text-sm"><AdminText>Нет жалоб в ожидании обработки.</AdminText></p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium"><AdminText>Ничего не найдено</AdminText></p>
              <p className="mt-1 text-sm"><AdminText>По выбранным фильтрам нет жалоб.</AdminText></p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium"><AdminText>Статус</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Причина</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Тип</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Цель</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Дата</AdminText></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/reports/${item.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {item.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}
                      >
                        <AdminText>{statusLabel(item.status)}</AdminText>
                      </span>
                    </td>
                    <td className="px-4 py-3"><AdminText>{reasonLabel(item.reason)}</AdminText></td>
                    <td className="px-4 py-3">
                      <AdminText>{item.targetType === "listing" ? "Объявление" : item.targetType === "message" ? "Сообщение" : "Пользователь"}</AdminText>
                    </td>
                    <td className="px-4 py-3">
                      {item.targetSummary.available ? (
                        <span className="text-neutral-800">{item.targetSummary.label}</span>
                      ) : (
                        <span className="text-neutral-400 italic">{item.targetSummary.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500"><AdminDate value={item.createdAt} /></td>
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
