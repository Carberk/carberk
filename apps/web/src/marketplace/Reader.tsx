import type { PublicMarketplaceSchemas } from "@auto-tm/contracts";

import { marketplaceCopy, type ReaderLocale } from "./copy";

type Car = PublicMarketplaceSchemas.PublicListing;
type Business = PublicMarketplaceSchemas.PublicBusiness;
export const showroomPath = (locale: ReaderLocale, business: Business) => `/${locale}/showrooms/${business.id}/${encodeURIComponent(business.slug)}`;
export function ReaderShell({ locale, path = "", children }: { locale: ReaderLocale; path?: string; children: React.ReactNode }) {
 return <main className="mx-auto w-full max-w-5xl px-5 py-8 text-foreground sm:px-8"><nav aria-label="Carberk" className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5"><a href={`/${locale}`} className="text-xl font-semibold focus-visible:outline-2">Carberk</a><div className="flex gap-4">{(["tk", "ru", "en"] as const).map(value => <a key={value} href={`/${value}${path}`} hrefLang={value} lang={value} className="underline underline-offset-4">{value.toUpperCase()}</a>)}</div></nav>{children}</main>;
}
export function BusinessIdentity({ business, locale }: { business: Business; locale: ReaderLocale }) {
 const c = marketplaceCopy(locale);
 return <header className="mb-8 space-y-4"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{business.name}</h1>{business.logoUrl && /^https:\/\//.test(business.logoUrl) ? <img src={business.logoUrl} alt="" className="h-16 w-16 object-contain" /> : null}{business.city ? <p>{business.city[locale]}</p> : null}<p>{business.identityChecked ? c.checked : c.synthetic}</p>{business.identityChecked ? <p className="max-w-prose text-sm text-muted-foreground">{c.checkedHelp}</p> : null}{business.address ? <p>{c.address}: {business.address}</p> : null}</header>;
}
export function PublicCar({ car, locale }: { car: Car; locale: ReaderLocale }) {
 const c = marketplaceCopy(locale); const title = `${car.brand[locale]} ${car.model[locale]} ${car.year ?? ""}`.trim();
 return <article className="border-b border-border py-6"><a href={`/${locale}/listings/${car.id}`} className="grid gap-5 focus-visible:outline-2 sm:grid-cols-[12rem_1fr]">{car.photos[0] ? <img alt={title} src={car.photos[0]} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-muted text-muted-foreground">{c.noPhoto}</div>}<div className="space-y-2"><h3 className="text-xl font-semibold">{title}</h3><p className="text-lg font-semibold tabular-nums">{new Intl.NumberFormat(locale).format(car.priceAmount)} {car.priceCurrency}</p><p>{car.city[locale]}{car.mileageKm !== null ? ` · ${new Intl.NumberFormat(locale).format(car.mileageKm)} km` : ""}</p>{car.status === "sold" ? <p>{c.sold}</p> : null}</div></a>{car.business ? <a className="mt-3 inline-block underline underline-offset-4" href={showroomPath(locale, car.business)}>{car.business.name}</a> : <p className="mt-3 text-sm text-muted-foreground">{c.personal}</p>}</article>;
}
