import Link from "next/link";
import { ErrorCode } from "@auto-tm/contracts";
import type { ReportsSchemas } from "@auto-tm/contracts";

import { listInspectionInterestStats } from "../../actions";

import { AdminText } from "@/lib/i18n";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function formatTmt(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value)} TMT`;
}

function interestPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заявка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "заявки";
  return "заявок";
}

export default async function InspectionInterestsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawPage = typeof params["page"] === "string" ? Number(params["page"]) : 1;
  const rawPageSize =
    typeof params["pageSize"] === "string" ? Number(params["pageSize"]) : DEFAULT_PAGE_SIZE;

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(
    Math.max(
      Number.isInteger(rawPageSize) && rawPageSize > 0 ? rawPageSize : DEFAULT_PAGE_SIZE,
      10,
    ),
    MAX_PAGE_SIZE,
  );

  const result = await listInspectionInterestStats({ page, pageSize });

  if (!result.ok && result.code === ErrorCode.ValidationFailed) {
    return (
      <div className="p-6 md:p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AdminText>Некорректные параметры пагинации.</AdminText></div>
      </div>
    );
  }

  const data = result.ok ? result.data : null;
  const items: ReportsSchemas.InspectionInterestCountItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.page ?? 1;

  function buildHref(p: { page?: number }): string {
    const sp = new URLSearchParams();
    if ((p.page ?? currentPage) > 1) {
      sp.set("page", String(p.page ?? currentPage));
    }
    if (pageSize !== DEFAULT_PAGE_SIZE) {
      sp.set("pageSize", String(pageSize));
    }
    const qs = sp.toString();
    return `/reports/inspection-interests${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold"><AdminText>Интерес к проверкам Carberk</AdminText></h1>
          <p className="text-sm text-neutral-500">
            {total} <AdminText>{interestPlural(total)}</AdminText>
          </p>
        </div>
      </div>

      {!result.ok ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AdminText>{result.error}</AdminText>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border bg-surface p-8 text-center text-neutral-500">
          <p className="text-lg font-medium"><AdminText>Пока нет заявок</AdminText></p>
          <p className="mt-1 text-sm"><AdminText>Когда покупатели или продавцы оставят интерес к проверке, он появится здесь.</AdminText></p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3 font-medium"><AdminText>Объявление</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Всего заявок</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Покупатели</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Продавцы</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Средняя готовность платить</AdminText></th>
                  <th className="px-4 py-3 font-medium"><AdminText>Ответов о цене</AdminText></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.listingId} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/listings/${item.listingId}`}
                        className="text-brand-600 hover:underline"
                      >
                        {item.listingId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{item.totalInterest}</td>
                    <td className="px-4 py-3">{item.buyerInterest}</td>
                    <td className="px-4 py-3">{item.sellerInterest}</td>
                    <td className="px-4 py-3">{formatTmt(item.willingnessToPayTmtAvg)}</td>
                    <td className="px-4 py-3">{item.willingnessToPayTmtCount}</td>
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
