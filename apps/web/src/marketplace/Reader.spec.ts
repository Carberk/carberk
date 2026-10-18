import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicMarketplaceSchemas } from "@auto-tm/contracts";

import { BusinessIdentity, PublicCar, ReaderShell } from "./Reader";
import { marketplaceCopy } from "./copy";
const business: PublicMarketplaceSchemas.PublicBusiness = { id: "00000000-0000-4000-8000-000000000001", slug: "ahal", name: "Ahal Motors", city: { en: "Ashgabat", ru: "Ашхабад", tk: "Aşgabat" }, contactPhone: "+99365123456", identityChecked: false, logoUrl: null };
const car: PublicMarketplaceSchemas.PublicListing = { id: "00000000-0000-4000-8000-000000000002", brand: { en: "Toyota", tk: "Toyota", ru: "Toyota" }, model: { en: "Camry", tk: "Camry", ru: "Camry" }, status: "active", year: 2020, priceAmount: 100000, priceCurrency: "TMT", mileageKm: 50000, city: { en: "Ashgabat", ru: "Ашхабад", tk: "Aşgabat" }, business, description: "Public description", photos: [], allowChat: true, contactPhone: business.contactPhone };
describe.each(["en", "ru", "tk"] as const)("anonymous reader in %s", locale => {
 it("renders truthful synthetic identity without suggesting checked car condition", () => {
  const html = renderToStaticMarkup(createElement(BusinessIdentity, { business, locale }));
  expect(html).toContain(marketplaceCopy(locale).synthetic); expect(html).not.toContain(marketplaceCopy(locale).checked);
 });
 it("reuses the car information and links the actual business with a stable showroom ID", () => {
  const html = renderToStaticMarkup(createElement(PublicCar, { car, locale }));
  expect(html).toContain("Toyota Camry 2020"); expect(html).toContain(`/${locale}/showrooms/${business.id}/ahal`); expect(html).not.toContain("inspection");
 });
 it("retains the current target when changing locale", () => {
  const html = renderToStaticMarkup(createElement(ReaderShell, { locale, path: `/listings/${car.id}`, children: "Reader" }));
  expect(html).toContain(`/tk/listings/${car.id}`); expect(html).toContain(`/ru/listings/${car.id}`); expect(html).toContain(`/en/listings/${car.id}`);
 });
});
