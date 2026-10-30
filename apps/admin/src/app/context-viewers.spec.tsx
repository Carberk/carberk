// @vitest-environment happy-dom
import type * as NextNavigation from "next/navigation";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

vi.mock("next/navigation", async (importOriginal) => ({ ...await importOriginal<typeof NextNavigation>(), useRouter: () => ({ refresh() {} }) }));

import ListingPage from "./(admin)/listings/[id]/page";

import { AdminLocaleProvider } from "@/lib/i18n";

const id = "10000000-0000-4000-8000-000000000001";
const names = { ru: "Toyota", tk: "Toyota", en: "Toyota" };
const createdAt = "2026-10-15T00:00:00.000Z";
const seller = { id, displayName: "Seller name", nameNumber: 1234, createdAt, suspended: false, deletionScheduled: false };
const detail = { id, publicNumber: 50, sellerId: id, status: "active", brand: names, model: names, city: names, region: names, year: 2024, priceAmount: 1000, priceCurrency: "TMT", createdAt, deletedAt: null, description: "Read-only vehicle description", vin: "TESTVIN", mileageKm: 500, condition: "used", enginePower: 100, damaged: false, knownIssuesText: null, locationText: null, publishedAt: createdAt, soldAt: null, updatedAt: createdAt, specifications: [], seller, complaintCount: 0, media: [{ id, kind: "video", url: null, width: 100, height: 100 }] };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes("/admin/context/listings/")) return Response.json(detail);
  if (url.endsWith("/admin/authority")) return Response.json({ marketplaceAdmin: true });
  return Response.json({ adminModerationActionsEnabled: false });
})));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("renders actual read-only listing context and an honest protected-video state without private data", async () => {
  render(<AdminLocaleProvider initialLocale="en">{await ListingPage({ params: Promise.resolve({ id }) })}</AdminLocaleProvider>);
  expect(screen.getByText("Read-only vehicle description")).toBeDefined();
  expect(screen.getByText("TESTVIN")).toBeDefined();
  expect(screen.getByText("Video is unavailable until tester-authorized playback is connected.")).toBeDefined();
  expect(document.querySelector("video")).toBeNull();
  expect(document.body.textContent).not.toMatch(/contactPhone|private-chat|sign-in/);
});
it("shows a safe current-authority denial rather than backend diagnostics", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ code: "FORBIDDEN", message: "private-chat-body" }, { status: 403 }));
  render(<AdminLocaleProvider initialLocale="en">{await ListingPage({ params: Promise.resolve({ id }) })}</AdminLocaleProvider>);
  expect(document.body.textContent).toContain("Insufficient permission.");
  expect(document.body.textContent).not.toContain("private-chat-body");
});

it.each(["tk", "ru", "en"] as const)("keeps listing filters and pagination when switching real rendered directory locale %s", async (locale) => {
  const { fireEvent } = await import("@testing-library/react");
  const { default: ListingsPage } = await import("./(admin)/listings/page");
  const { AdminLanguageSwitch } = await import("@/lib/i18n");
  vi.mocked(fetch).mockResolvedValue(Response.json({ items: [detail], total: 60, page: 2, pageSize: 25, brands: [{ id, name: names }], regions: [{ id, name: names }] }));
  const view = await ListingsPage({ searchParams: Promise.resolve({ q: "Toyota", status: "active", brandId: id, from: "2026-10-01", page: "2" }) });
  const { container } = render(<AdminLocaleProvider initialLocale="ru"><AdminLanguageSwitch/>{view}</AdminLocaleProvider>);
  const input = container.querySelector<HTMLInputElement>('input[name="q"]');
  if (!input) throw new Error("Search missing");
  fireEvent.change(input, { target: { value: "Unsubmitted search" } });
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Язык"]');
  if (!select) throw new Error("Language switch missing");
  fireEvent.change(select, { target: { value: locale } });
  expect(input.value).toBe("Unsubmitted search");
  expect(container.querySelector<HTMLSelectElement>('select[name="status"]')?.value).toBe("active");
  expect(container.querySelector<HTMLInputElement>('input[name="from"]')?.value).toBe("2026-10-01");
  expect(container.querySelector('form')?.getAttribute("action")).toBe("/listings");
  const next = [...container.querySelectorAll("a")].find(link => link.href.includes("page=3"));
  expect(next?.href).toContain("status=active");
  expect(next?.href).toContain("q=Toyota");
  expect(screen.getByRole("heading", { name: locale === "tk" ? "Bildirişler" : locale === "en" ? "Listings" : "Объявления" })).toBeDefined();
});
it.each([404, 503])("renders missing and unavailable user context safely for HTTP %s", async (status) => {
  const { default: UserPage } = await import("./(admin)/users/[id]/page");
  vi.mocked(fetch).mockResolvedValue(Response.json({ message: "private-payment-data" }, { status }));
  render(<AdminLocaleProvider initialLocale="en">{await UserPage({ params: Promise.resolve({ id }) })}</AdminLocaleProvider>);
  expect(screen.getByRole("alert").textContent).toBe(status === 404 ? "The record was deleted or is unavailable." : "Temporarily unavailable. Try again.");
  expect(document.body.textContent).not.toContain("private-payment-data");
  expect(document.querySelector("form")).toBeNull();
});
it("shows the user projection and bounded listings without contact or private artifacts", async () => {
  const { default: UserPage } = await import("./(admin)/users/[id]/page");
  vi.mocked(fetch).mockImplementation(async input => String(input).includes("/admin/context/users/") ? Response.json({ ...seller, listings: [detail], listingCount: 26, complaintCount: 2, phone: "private-contact" }) : Response.json({ adminModerationActionsEnabled: false }));
  render(<AdminLocaleProvider initialLocale="en">{await UserPage({ params: Promise.resolve({ id }) })}</AdminLocaleProvider>);
  expect(screen.getByText("Seller name")).toBeDefined();
  expect(screen.getByText("Showing the latest 25 listings.")).toBeDefined();
  expect(document.body.textContent).not.toContain("private-contact");
});
it("treats a failed transport as unavailable without leaking diagnostics", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("private-backend-host"));
  render(<AdminLocaleProvider initialLocale="en">{await ListingPage({ params: Promise.resolve({ id }) })}</AdminLocaleProvider>);
  expect(screen.getByRole("alert").textContent).toBe("Temporarily unavailable. Try again.");
  expect(document.body.textContent).not.toContain("private-backend-host");
});
