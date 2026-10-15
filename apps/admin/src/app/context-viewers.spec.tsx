// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

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
