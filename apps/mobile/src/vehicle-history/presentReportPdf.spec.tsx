import { expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { AppState } from "react-native";
import { focusManager } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";

import { onPlatform } from "../../test/keyboardAvoidance";
import { fireEvent, renderMobile } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession } from "../auth/session";

import { destination, reportPdfFiles, reportPdfFileSystem } from "./application/testing/reportPdfDevice";
import { DeliveredReport } from "./DeliveredReport";
import { presentReportPdf } from "./presentReportPdf";

vi.mock("expo-file-system/legacy", async () => (await import("./application/testing/reportPdfDevice")).reportPdfFileSystem);
vi.mock("expo", () => ({ requireNativeModule: vi.fn() }));

it("does not export a purchaser's PDF after the session changes while Android creates the destination", async () => {
  let authorized = true;
  reportPdfFileSystem.StorageAccessFramework.createFileAsync.mockImplementationOnce(async () => {
    reportPdfFiles.set(destination, "");
    authorized = false;
    return destination;
  });
  await onPlatform("android", async () => {
    await expect(presentReportPdf("download", { filename: "Report.pdf", pages: 1, sizeBytes: 9 }, "JVBERi0xLjQK", async () => {
      if (!authorized) throw new Error("Session changed");
    })).rejects.toThrow("Session changed");
  });
  expect(reportPdfFiles.size).toBe(0);
});

it("shows recovery after the Android destination picker returns and the PDF cannot be saved", async () => {
  const userId = "00000000-0000-4000-8000-000000000001", sessionId = "synthetic-session";
  const requestId = "10000000-0000-4000-8000-000000000101", artifactId = "30000000-0000-4000-8000-000000000103";
  let stored: string | null = null;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  await storeAuthSession({
    accessToken: `header.${btoa(JSON.stringify({ sid: sessionId, sub: userId }))}.signature`,
    refreshToken: "synthetic-refresh",
    user: { id: userId, phone: null, email: "synthetic@example.test", displayName: null, role: "buyer" },
  });
  server.use(
    http.get(`*/vehicle-history/requests/${requestId}/report`, () => HttpResponse.json({
      status: "delivered", deliveredAt: "2026-11-14T08:00:00.000Z",
      artifact: { id: artifactId, source: "new_source", format: "pdf",
        report: { reportId: "synthetic", provider: "Carfax", vin: "DEMA0000000000001", originalReportDate: "2026-10-14",
          language: "en", permittedUse: true },
        pdf: { filename: "Report.pdf", pages: 1, sizeBytes: 9 } },
    })),
    http.get(`*/vehicle-history/requests/${requestId}/report/${artifactId}/pdf`, () => HttpResponse.json({ dataBase64: "JVBERi0xLjQK" })),
  );
  reportPdfFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync.mockImplementationOnce(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    return { granted: true, directoryUri: "content://synthetic.documents/reports" };
  });
  reportPdfFileSystem.StorageAccessFramework.createFileAsync.mockRejectedValueOnce(new Error("Destination unavailable"));
  AppState.currentState = "active";
  focusManager.setFocused(true);
  await onPlatform("android", async () => {
    const view = await renderMobile(<DeliveredReport viewer={{ userId, sessionId }} requestId={requestId}
      active online ready openComposer={vi.fn()} />);
    await fireEvent.press(await view.findByRole("button", { name: "Download PDF" }));
    expect(await view.findByText("Could not open or save the PDF. Try again or contact your operator.")).toBeTruthy();
    expect(view.getByRole("button", { name: "Contact operator" })).toBeEnabled();
  });
  expect(reportPdfFiles.size).toBe(0);
});
