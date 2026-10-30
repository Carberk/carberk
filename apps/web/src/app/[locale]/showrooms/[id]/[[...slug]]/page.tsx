import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { readPublicShowroom } from "@/marketplace/readers";
import { BusinessIdentity, PublicCar, ReaderShell, showroomPath } from "@/marketplace/Reader";
import { marketplaceCopy, readerLocale } from "@/marketplace/copy";
import { publicWebUrl } from "@/lib/public-web-url";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; id: string; slug?: string[] }>; searchParams: Promise<{ cursor?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
 const { locale: raw, id } = await params; const locale = readerLocale(raw); const page = await readPublicShowroom(id);
 if (!page) return { title: marketplaceCopy(locale).unavailable, robots: { index: false, follow: false } };
 const url = publicWebUrl(showroomPath(locale, page.business));
 return { title: page.business.name, alternates: { canonical: url }, openGraph: { title: page.business.name, url } };
}
export default async function ShowroomReader({ params, searchParams }: Props) {
 const { locale: raw, id, slug } = await params; const locale = readerLocale(raw); const c = marketplaceCopy(locale); const { cursor } = await searchParams;
 const page = await readPublicShowroom(id, cursor); if (!page) notFound();
 const canonical = showroomPath(locale, page.business);
 if (raw !== locale || slug?.join("/") !== page.business.slug) redirect(`${canonical}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
 return <ReaderShell locale={locale} path={`/showrooms/${page.business.id}/${encodeURIComponent(page.business.slug)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`}><BusinessIdentity business={page.business} locale={locale} /><section className="mb-10"><h2 className="text-2xl font-semibold">{c.available}</h2><p className="mt-2 text-muted-foreground">{c.inventory}</p>{page.listings.length ? page.listings.map(car => <PublicCar key={car.id} car={car} locale={locale} />) : <p className="py-10">{c.empty}</p>}{page.nextCursor ? <a className="mt-6 inline-block underline underline-offset-4" href={`${canonical}?cursor=${encodeURIComponent(page.nextCursor)}`}>{c.more}</a> : null}</section>{page.business.description || page.business.hours || page.business.services ? <section className="max-w-prose space-y-4"><h2 className="text-xl font-semibold">{c.details}</h2>{page.business.description ? <p className="whitespace-pre-wrap leading-relaxed">{page.business.description}</p> : null}{page.business.hours ? <p>{c.hours}: {page.business.hours}</p> : null}{page.business.services ? <p>{c.services}: {page.business.services}</p> : null}</section> : null}</ReaderShell>;
}
