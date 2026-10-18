import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { readPublicListing } from "@/marketplace/readers";
import { ReaderShell, showroomPath } from "@/marketplace/Reader";
import { marketplaceCopy, readerLocale } from "@/marketplace/copy";
import { publicWebUrl } from "@/lib/public-web-url";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
 const { locale: raw, id } = await params; const locale = readerLocale(raw); const car = await readPublicListing(id);
 if (!car) return { title: marketplaceCopy(locale).unavailable, robots: { index: false, follow: false } };
 const title = `${car.status === "sold" ? `${marketplaceCopy(locale).sold}: ` : ""}${car.brand[locale]} ${car.model[locale]} ${car.year ?? ""}`.trim();
 return { title, alternates: { canonical: publicWebUrl(`/${locale}/listings/${id}`) }, openGraph: { title, url: publicWebUrl(`/${locale}/listings/${id}`), ...(car.photos[0] ? { images: [car.photos[0]] } : {}) } };
}
export default async function ListingReader({ params }: Props) {
 const { locale: raw, id } = await params; const locale = readerLocale(raw); const c = marketplaceCopy(locale); const car = await readPublicListing(id);
 if (!car) notFound();
 if (raw !== locale) redirect(`/${locale}/listings/${encodeURIComponent(id)}`);
 const title = `${car.brand[locale]} ${car.model[locale]} ${car.year ?? ""}`.trim();
 return <ReaderShell locale={locale} path={`/listings/${car.id}`}><header className="mb-7 space-y-3"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="text-2xl font-semibold tabular-nums">{new Intl.NumberFormat(locale).format(car.priceAmount)} {car.priceCurrency}</p><p>{car.city[locale]}{car.mileageKm !== null ? ` · ${new Intl.NumberFormat(locale).format(car.mileageKm)} km` : ""}</p>{car.business ? <a className="inline-block underline underline-offset-4" href={showroomPath(locale, car.business)}>{car.business.name}</a> : <p>{c.personal}</p>}</header><div className="grid gap-4 sm:grid-cols-2">{car.photos.map((photo, index) => <img key={photo} src={photo} alt={`${title}, ${c.photo} ${index + 1}`} loading={index ? "lazy" : "eager"} className="aspect-[4/3] w-full rounded-xl object-cover" />)}</div>{car.status === "sold" ? <section className="my-8 space-y-3"><h2 className="text-xl font-semibold">{c.sold}</h2><p>{c.soldHelp}</p>{car.business ? <a className="underline underline-offset-4" href={showroomPath(locale, car.business)}>{c.available}</a> : <a href={`/${locale}`}>{c.home}</a>}</section> : <section className="my-8 flex flex-wrap gap-5">{car.contactPhone ? <a className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground" href={`tel:${car.contactPhone}`}>{c.contact}: {car.contactPhone}</a> : null}{car.allowChat ? <a className="rounded-lg border border-border px-5 py-3" href={`autotm:///conversations/open-listing?listingId=${car.id}`}>{c.message}</a> : null}</section>}{car.description ? <section className="my-8 max-w-prose space-y-3"><h2 className="text-xl font-semibold">{c.description}</h2><p className="whitespace-pre-wrap leading-relaxed">{car.description}</p></section> : null}</ReaderShell>;
}
