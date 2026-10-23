"use client";

import Link from "next/link";
import type { AdminContextSchemas } from "@auto-tm/contracts";

import { AdminDate, AdminText, useAdminLocale } from "@/lib/i18n";

const specificationLabels: Record<string, string> = { generation: "Поколение", color: "Цвет", bodyType: "Кузов", engineType: "Двигатель", transmission: "Коробка передач", driveType: "Привод" };
export function AdminContextListingRows({ items }: { items: AdminContextSchemas.AdminContextListingPage["items"] }) {
  const locale = useAdminLocale().locale;
  if (items.length === 0) return <p role="status"><AdminText>Нет записей по выбранным фильтрам.</AdminText></p>;
  return <ul className="divide-y">{items.map(item => <li key={item.id} className="space-y-1 py-4"><Link href={`/listings/${item.id}`} className="font-medium underline underline-offset-4">#{item.publicNumber} {item.brand[locale]} {item.model[locale]} {item.year}</Link><p>{item.priceAmount.toLocaleString(locale)} {item.priceCurrency} · {item.city[locale]} · <AdminText>{item.status}</AdminText>{item.deletedAt ? <> · <AdminText>Удалено</AdminText></> : null}</p><p className="break-all text-sm text-neutral-500">{item.id}</p></li>)}</ul>;
}
export function AdminContextUserSummary({ user }: { user: AdminContextSchemas.AdminContextUserDetail | AdminContextSchemas.AdminContextListingDetail["seller"] }) {
  return <div className="space-y-2"><Link href={`/users/${user.id}`} className="underline underline-offset-4">{user.displayName ?? `#${user.nameNumber}`}</Link><p className="break-all text-sm text-neutral-500">{user.id}</p><p><AdminText>Дата регистрации</AdminText>: <AdminDate value={user.createdAt}/></p><p><AdminText>{user.suspended ? "Заблокирован" : "Без блокировки"}</AdminText> · <AdminText>{user.deletionScheduled ? "Удаление запланировано" : "Удаление не запланировано"}</AdminText></p></div>;
}
export function AdminContextListingDetail({ listing }: { listing: AdminContextSchemas.AdminContextListingDetail }) {
  const locale = useAdminLocale().locale;
  const field = (label: string, value: React.ReactNode) => <div key={label} className="border-b py-3"><dt className="text-sm text-neutral-500"><AdminText>{label}</AdminText></dt><dd className="mt-1 break-words">{value ?? "—"}</dd></div>;
  return <section className="mb-8 space-y-6" aria-labelledby="listing-context-title"><h2 id="listing-context-title" className="text-xl font-semibold">#{listing.publicNumber} {listing.brand[locale]} {listing.model[locale]} {listing.year}</h2>
    {listing.deletedAt ? <p role="status"><AdminText>Удалено</AdminText>: <AdminDate value={listing.deletedAt}/></p> : null}
    <p>{listing.priceAmount.toLocaleString(locale)} {listing.priceCurrency} · <AdminText>{listing.status}</AdminText></p>
    <div className="grid gap-4 sm:grid-cols-2">{listing.media.map((media, index) => media.kind === "video" ? <p key={media.id} role="status" className="rounded border p-4"><AdminText>Видео недоступно до подключения разрешённого тестерам просмотра.</AdminText></p> : media.url ? <a key={media.id} href={media.url} target="_blank" rel="noreferrer"><img src={media.url} width={media.width ?? 640} height={media.height ?? 480} alt={`${listing.brand[locale]} ${listing.model[locale]} ${index + 1}`} className="h-auto w-full rounded object-contain"/></a> : null)}</div>
    <p className="whitespace-pre-wrap break-words">{listing.description ?? "—"}</p>
    <dl className="grid gap-x-6 sm:grid-cols-2">{field("VIN", listing.vin)}{field("Пробег, км", listing.mileageKm)}{field("Состояние", listing.condition ? <AdminText>{listing.condition}</AdminText> : null)}{field("Мощность", listing.enginePower)}{listing.specifications.map(spec => field(specificationLabels[spec.name] ?? spec.name, spec.value?.[locale] ?? spec.id))}{field("Повреждения", listing.damaged === null ? null : <AdminText>{listing.damaged ? "Да" : "Нет"}</AdminText>)}{field("Известные проблемы", listing.knownIssuesText)}{field("Местоположение", [listing.region?.[locale], listing.city[locale], listing.locationText].filter(Boolean).join(", "))}{field("Создано", <AdminDate value={listing.createdAt}/>)}{field("Обновлено", <AdminDate value={listing.updatedAt}/>)}{field("Опубликовано", listing.publishedAt ? <AdminDate value={listing.publishedAt}/> : null)}{field("Продано", listing.soldAt ? <AdminDate value={listing.soldAt}/> : null)}</dl>
    <section className="space-y-2 border-t pt-4"><h3 className="font-semibold"><AdminText>Продавец</AdminText></h3><AdminContextUserSummary user={listing.seller}/></section>
    <p><AdminText>Жалобы на объявление</AdminText>: {listing.complaintCount} · <Link href="/reports" className="underline"><AdminText>Очередь жалоб</AdminText></Link></p>
  </section>;
}
export function AdminContextUserDetail({ user }: { user: AdminContextSchemas.AdminContextUserDetail }) {
  return <section className="mb-8 space-y-6"><AdminContextUserSummary user={user}/><p><AdminText>Жалобы на пользователя</AdminText>: {user.complaintCount} · <Link href="/reports" className="underline"><AdminText>Очередь жалоб</AdminText></Link></p><h2 className="text-xl font-semibold"><AdminText>Объявления пользователя</AdminText> · {user.listingCount}</h2><AdminContextListingRows items={user.listings}/>{user.listingCount > user.listings.length ? <p><AdminText>Показаны последние 25 объявлений.</AdminText></p> : null}</section>;
}

export function AdminContextDirectory({ kind, result, query }: {
  kind: "listings" | "users";
  result: AdminContextSchemas.AdminContextListingPage | AdminContextSchemas.AdminContextUserPage;
  query: Record<string, string>;
}) {
  const locale = useAdminLocale().locale;
  const listingResult = "brands" in result ? result : null;
  const control = "mt-1 min-h-11 w-full rounded-md border bg-white px-3 text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600";
  const pageLink = (page: number) => { const params = new URLSearchParams(query); params.set("page", String(page)); return `/${kind}?${params}`; };
  return <div className="mx-auto w-full max-w-6xl space-y-6 p-6 md:p-8"><h1 className="text-2xl font-semibold"><AdminText>{kind === "listings" ? "Объявления" : "Пользователи"}</AdminText></h1>
    <form action={`/${kind}`} className="grid gap-4 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium"><AdminText>{kind === "listings" ? "Поиск по номеру, VIN, марке или модели" : "Поиск по имени или номеру пользователя"}</AdminText><input name="q" maxLength={100} defaultValue={query["q"]} className={control}/></label>
      {listingResult ? <>
        <label className="text-sm font-medium"><AdminText>Статус</AdminText><select name="status" defaultValue={query["status"] ?? ""} className={control}><option value=""><AdminText>Все</AdminText></option>{["draft", "pending_review", "active", "sold", "archived", "rejected", "banned"].map(status => <option key={status} value={status}><AdminText>{status}</AdminText></option>)}</select></label>
        <label className="text-sm font-medium"><AdminText>Марка</AdminText><select name="brandId" defaultValue={query["brandId"] ?? ""} className={control}><option value=""><AdminText>Все</AdminText></option>{listingResult.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name[locale]}</option>)}</select></label>
        <label className="text-sm font-medium"><AdminText>Регион</AdminText><select name="regionId" defaultValue={query["regionId"] ?? ""} className={control}><option value=""><AdminText>Все</AdminText></option>{listingResult.regions.map(region => <option key={region.id} value={region.id}>{region.name[locale]}</option>)}</select></label>
        <label className="text-sm font-medium"><AdminText>Создано с</AdminText><input type="date" name="from" defaultValue={query["from"]?.slice(0,10)} className={control}/></label>
        <label className="text-sm font-medium"><AdminText>Создано по</AdminText><input type="date" name="to" defaultValue={query["to"]?.slice(0,10)} className={control}/></label>
      </> : null}
      <button type="submit" className="min-h-11 self-end rounded-md bg-red-600 px-5 py-2 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"><AdminText>Найти</AdminText></button>
    </form>
    <p className="text-sm text-neutral-600"><AdminText>Найдено</AdminText>: {result.total}</p>
    {kind === "listings" ? <AdminContextListingRows items={result.items as AdminContextSchemas.AdminContextListingPage["items"]}/> : result.items.length === 0 ? <p role="status"><AdminText>Нет записей по выбранным фильтрам.</AdminText></p> : <ul className="divide-y">{(result.items as AdminContextSchemas.AdminContextUserPage["items"]).map(user => <li key={user.id} className="py-4"><AdminContextUserSummary user={user}/></li>)}</ul>}
    <nav aria-label={locale === "tk" ? "Sahypalar" : locale === "en" ? "Pagination" : "Страницы"} className="flex flex-wrap items-center gap-4 border-t pt-5">
      {result.page > 1 ? <Link href={pageLink(result.page - 1)} className="min-h-11 rounded border px-4 py-2"><AdminText>Назад</AdminText></Link> : null}<span><AdminText>Страница</AdminText> {result.page}</span>{result.page * result.pageSize < result.total ? <Link href={pageLink(result.page + 1)} className="min-h-11 rounded border px-4 py-2"><AdminText>Далее</AdminText></Link> : null}
    </nav>
  </div>;
}
