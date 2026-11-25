// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HistoryOrderSchemas as H, HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";

import { ReportArtifactPanel } from "./ReportArtifactPanel";
import { historyReportAction } from "./report-actions";

vi.mock("./report-actions", () => ({ historyReportAction: vi.fn() }));

const id = "10000000-0000-4000-8000-000000001231";
const scope = "a".repeat(64);
const date = "2026-10-14";
const recordedAt = "2026-11-21T05:00:00.000Z";
const report = { format: "pdf", originalReportDate: date, permittedUse: true } as const;
const intent: Extract<H.HistoryFulfilmentIntent, { status: "obtained" }> = {
  id, version: 2, status: "obtained", attempt: 1, source: "archive", funding: "order", report, recordedAt,
  accepted: { acceptedRevision: 0, vin: "DEMA0000000000001", provider: "Carfax", format: "pdf", originalReportDate: date },
};

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });

function panel(locale: "en" | "ru" | "tk" = "en", onDeliveryIssue = vi.fn()) {
  return render(<ReportArtifactPanel locale={locale} id={id} scope={scope} orderId={id} version={1} intent={intent}
    canDeliver onDelivered={vi.fn()} invalidate={vi.fn()} onDeliveryIssue={onDeliveryIssue} recoveryAvailable />);
}

it("offers the same-originals upload when an older archive validation is interrupted", async () => {
  vi.mocked(historyReportAction).mockResolvedValueOnce({ status: "ok", view: { status: "staged" } });
  const view = panel();

  expect(await view.findByText("Upload interrupted. Retry with the same originals.")).toBeTruthy();
  expect(view.getByRole("button", { name: "Validate formats" })).toBeTruthy();
  expect(view.queryByRole("button", { name: "Find reports for this VIN" })).toBeNull();
});

it.each([
  ["en", "Record a delivery problem", "Delivery problem recorded. Review recovery for this order."],
  ["ru", "Зафиксировать проблему с доставкой", "Проблема с доставкой зафиксирована. Проверьте варианты для этого заказа."],
  ["tk", "Gowşuryş meselesini ýazga almak", "Gowşuryş meselesi ýazga alyndy. Şu sargyt boýunça çözgütleri barlaň."],
] as const)("confirms a recorded archive delivery problem and refreshes recovery in %s", async (locale, action, feedback) => {
  const refresh = vi.fn();
  vi.mocked(historyReportAction).mockResolvedValueOnce({ status: "ok", view: { status: "empty" } })
    .mockResolvedValueOnce({ status: "missing" });
  const view = panel(locale, refresh);

  fireEvent.click(await view.findByRole("button", { name: action }));
  expect(await view.findByText(feedback)).toBeTruthy();
  expect(refresh).toHaveBeenCalledOnce();
  expect(view.getByRole("link").getAttribute("href")).toBe("#history-delivery-recovery");
});

it("brings the validated result into view after association", async () => {
  const proofs = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
  const item: R.HistoryArchiveItem = { id, vin: intent.accepted.vin, provider: "Carfax",
    format: "pdf", originalReportDate: date, language: "en" };
  const { vin, provider, originalReportDate, language } = item;
  vi.mocked(historyReportAction).mockResolvedValueOnce({ status: "ok", view: { status: "empty" } })
    .mockResolvedValueOnce({ status: "archive", items: [item] }).mockResolvedValueOnce({
      status: "ok", view: { status: "validated", validatedAt: recordedAt,
        artifact: { id, source: "archive", format: "pdf", report: { vin, provider, originalReportDate, language,
          reportId: "fixture", permittedUse: true },
          pdf: { filename: "vehicle-history.pdf", sizeBytes: 42, pages: 1 } } },
    });
  const view = panel();

  fireEvent.click(await view.findByRole("button", { name: "Find reports for this VIN" }));
  fireEvent.click(await view.findByRole("button", { name: "Associate with this order" }));
  const result = await view.findByText("Validated · awaiting delivery");
  expect(document.activeElement).toBe(result);
  expect(proofs).toHaveBeenCalledWith({ block: "center" });
  expect(view.getByRole("button", { name: "Deliver to purchaser" })).toBeTruthy();
});
