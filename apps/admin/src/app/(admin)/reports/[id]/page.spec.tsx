// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  getReportDetail: vi.fn(),
  getConfig: vi.fn(),
  dismissReport: vi.fn(),
  banListing: vi.fn(),
  suspendUser: vi.fn(),
  removeUserPhoto: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../actions", () => ({
  getReportDetail: mockState.getReportDetail,
  getConfig: mockState.getConfig,
  dismissReport: mockState.dismissReport,
  banListing: mockState.banListing,
  suspendUser: mockState.suspendUser,
  removeUserPhoto: mockState.removeUserPhoto,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ refresh: mockState.refresh }),
}));

import ReportDetailPage from "./page";

const PHOTO_KEY = "pending/u1-photo/original.webp";

function userReport(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    status: "pending",
    reason: "spam",
    createdAt: "2026-01-01T00:00:00Z",
    reporter: { available: true, label: "Alice" },
    target: {
      targetType: "user",
      available: true,
      label: "Bob",
      targetId: "u1",
      role: "buyer",
      avatarKey: PHOTO_KEY,
      avatarIndex: 3,
    },
    pendingReportsOnTargetCount: 0,
    ...overrides,
  };
}

function mockDetail(report: unknown, moderationEnabled = true) {
  mockState.getReportDetail.mockResolvedValue({ ok: true, data: report });
  mockState.getConfig.mockResolvedValue({
    ok: true,
    data: {
      reportEntryEnabled: true,
      adminModerationActionsEnabled: moderationEnabled,
      inspectionInterestEnabled: true,
    },
  });
}

async function renderPage(id = "r1") {
  const jsx = await ReportDetailPage({ params: Promise.resolve({ id }) });
  return render(jsx);
}

function removalReasonInput() {
  const form = screen.getByRole("button", { name: "Подтвердить удаление" }).closest("form");
  if (!form) throw new Error("Removal confirmation form missing");
  return within(form).getByLabelText("Причина действия");
}

describe("ReportDetailPage profile photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_MINIO_PUBLIC_URL", "https://media.example.test");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("shows the reported user's Profile Photo and the remove action when a photo is set", async () => {
    mockDetail(userReport());

    await renderPage();

    const photo = screen.getByRole("img", { name: "Фото профиля" });
    expect(photo.getAttribute("src")).toBe("https://media.example.test/listing-photos/pending/u1-photo/thumbnail.webp?v=webp-natural-1");
    expect(screen.getByText("Удалить фото профиля")).toBeDefined();
    expect(screen.getByRole("button", { name: "Удалить фото" })).toBeDefined();
  });

  it("shows nothing extra when the user has only the Assigned Avatar", async () => {
    mockDetail(userReport({ target: {
      targetType: "user",
      available: true,
      label: "Bob",
      targetId: "u1",
      role: "buyer",
      avatarKey: null,
    } }));

    await renderPage();

    expect(screen.queryByRole("img", { name: "Фото профиля" })).toBeNull();
    expect(screen.queryByText("Удалить фото профиля")).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it("offers no remove action when moderation actions are disabled", async () => {
    mockDetail(userReport(), false);

    await renderPage();

    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
    expect(screen.getByText("Действия модерации временно недоступны.")).toBeDefined();
  });

  it("offers no remove action once the report is actioned", async () => {
    mockDetail(userReport({ status: "actioned", reviewedAt: "2026-01-02T00:00:00Z" }));

    await renderPage();

    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it("shows no photo block for a listing report", async () => {
    mockDetail({
      id: "r1",
      status: "pending",
      reason: "spam",
      createdAt: "2026-01-01T00:00:00Z",
      reporter: { available: true, label: "Alice" },
      target: {
        targetType: "listing",
        available: true,
        label: "2020 Toyota Camry",
        targetId: "l1",
        status: "active",
      },
      pendingReportsOnTargetCount: 0,
    });

    await renderPage();

    expect(screen.queryByRole("img", { name: "Фото профиля" })).toBeNull();
    expect(screen.queryByText("Удалить фото профиля")).toBeNull();
  });
  it("hides removal if config cannot confirm permission", async () => {
    mockDetail(userReport());
    mockState.getConfig.mockResolvedValue({ ok: false, code: "FORBIDDEN", error: "Нет доступа" });
    await renderPage();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it("renders no action when the staff read is forbidden", async () => {
    mockDetail(userReport());
    mockState.getReportDetail.mockResolvedValue({ ok: false, code: "FORBIDDEN", error: "Нет доступа" });
    await renderPage();
    expect(screen.getByText("Нет доступа")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it("shows the Assigned Avatar and actioned report after successful removal and refresh", async () => {
    mockDetail(userReport());
    mockState.removeUserPhoto.mockResolvedValue({ ok: true, data: {
      targetId: "u1", targetState: { avatarKey: null, avatarIndex: 3 }, reportStatus: "actioned", reportId: "r1", auditLogId: "a1",
    } });
    const view = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото" }));
    fireEvent.change(removalReasonInput(), { target: { value: "Неприемлемое фото" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить удаление" }));
    await waitFor(() => expect(mockState.refresh).toHaveBeenCalled());
    mockDetail(userReport({ status: "actioned", target: { ...userReport().target, avatarKey: null } }));
    view.rerender(await ReportDetailPage({ params: Promise.resolve({ id: "r1" }) }));
    expect(screen.getByText("Обработана")).toBeDefined();
    expect(screen.getByRole("img", { name: "Назначенный аватар" }).getAttribute("src")).toBe("/assigned-avatars/3.svg");
    expect(screen.queryByRole("img", { name: "Фото профиля" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it("keeps photo and pending report on a failed removal", async () => {
    mockDetail(userReport());
    mockState.removeUserPhoto.mockResolvedValue({ ok: false, code: "INTERNAL_ERROR", error: "Ошибка сервера" });
    const view = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото" }));
    fireEvent.change(removalReasonInput(), { target: { value: "Неприемлемое фото" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить удаление" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Не удалось выполнить действие.");
    const refreshedReport = userReport();
    mockDetail(refreshedReport);
    view.rerender(await ReportDetailPage({ params: Promise.resolve({ id: "r1" }) }));
    expect(mockState.getReportDetail).toHaveBeenCalledTimes(2);
    expect(screen.getByText("В ожидании")).toBeDefined();
    expect(screen.getByRole("img", { name: "Фото профиля" })).toBeDefined();
    expect(screen.queryByText("Фото удалено.")).toBeNull();
  });

  it.each([
    { role: "admin" },
    { available: false },
  ])("hides removal for ineligible targets %j", async (overrides) => {
    mockDetail(userReport({ target: { ...userReport().target, ...overrides } }));
    await renderPage();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it.each([undefined, "", "   "])("shows a Russian unavailable note without a relative photo URL when media origin is %j", async (origin) => {
    vi.stubEnv("NEXT_PUBLIC_MINIO_PUBLIC_URL", origin);
    mockDetail(userReport());
    await renderPage();
    expect(screen.getByText("Фото профиля недоступно.")).toBeDefined();
    expect(screen.queryByRole("img", { name: "Фото профиля" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it.each(["jpg", "webp", "jpeg"])("loads the mobile thumbnail variant for an original %s photo", async (extension) => {
    mockDetail(userReport({ target: { ...userReport().target, avatarKey: `pending/u1-photo/original.${extension}` } }));
    await renderPage();
    expect(screen.getByRole("img", { name: "Фото профиля" }).getAttribute("src"))
      .toBe("https://media.example.test/listing-photos/pending/u1-photo/thumbnail.webp?v=webp-natural-1");
  });

  it("shows no extra avatar on an actioned report that had only an Assigned Avatar", async () => {
    mockDetail(userReport({ status: "actioned", target: { ...userReport().target, avatarKey: null }, targetModerationState: { suspendedAt: "2026-01-02T00:00:00Z" } }));
    await renderPage();
    expect(screen.queryByRole("img", { name: "Назначенный аватар" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Фото профиля" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить фото" })).toBeNull();
  });

  it("wraps the restored Assigned Avatar index to the bundled set", async () => {
    mockDetail(userReport());
    const view = await renderPage();
    mockDetail(userReport({ status: "actioned", target: { ...userReport().target, avatarKey: null, avatarIndex: 15 } }));
    view.rerender(await ReportDetailPage({ params: Promise.resolve({ id: "r1" }) }));
    expect(screen.getByRole("img", { name: "Назначенный аватар" }).getAttribute("src"))
      .toBe("/assigned-avatars/3.svg");
  });

});

function messageReport(targetOverrides: Record<string, unknown> = {}) {
  return userReport({ target: {
    targetType: "message", targetId: "m1", available: true, label: "Сообщение",
    messageBody: "Текст жалобы <script>bad()</script>", messageCreatedAt: "2026-01-01T12:00:00Z", messageHasAttachment: true,
    sender: { available: true, label: "Борис", userId: "sender-1", role: "buyer" },
    ...targetOverrides,
  } });
}

describe("Reported Message detail", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
  it("shows only the reported Message, attachment marker, sent time and sender link", async () => {
    vi.stubEnv("TZ", "UTC");
    mockDetail(messageReport());
    await renderPage();
    expect(screen.getByText("Текст жалобы <script>bad()</script>")).toBeDefined();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("Есть вложение")).toBeDefined();
    expect(screen.getByText("Тип:").parentElement?.textContent).toBe("Тип: Сообщение");
    expect(screen.getByText("Отправлено:").parentElement?.textContent).toBe("Отправлено: 1 янв. 2026 г., 12:00 UTC");
    vi.unstubAllEnvs();
    expect(screen.getByRole("link", { name: "Борис" }).getAttribute("href")).toBe("/users/sender-1");
    expect(document.querySelector('a[href="/users/m1"]')).toBeNull();
    expect(screen.getByText("Заблокировать автора сообщения")).toBeDefined();
    expect(screen.getByText("Автор жалобы:").parentElement?.textContent).toBe("Автор жалобы: Alice");
    expect(screen.queryByText("Отправитель:")).toBeNull();
  });
  it("submits suspension with the sender ID and Message report ID and refreshes on success", async () => {
    mockDetail(messageReport());
    mockState.suspendUser.mockResolvedValue({ ok: true, data: { reportStatus: "actioned" } });
    await renderPage();
    const button = screen.getByRole("button", { name: "Заблокировать пользователя" });
    const form = button.closest("form");
    if (!form) throw new Error("Suspension form missing");
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "Спам" } });
    fireEvent.click(button);
    await waitFor(() => expect(mockState.suspendUser).toHaveBeenCalledWith("sender-1", "Спам", "r1"));
    await waitFor(() => expect(mockState.refresh).toHaveBeenCalled());
    expect(screen.getByText("Действие выполнено успешно.")).toBeDefined();
  });
  it("dismisses a Message report through the existing audited action", async () => {
    mockDetail(messageReport());
    mockState.dismissReport.mockResolvedValue({ ok: true, data: { status: "dismissed" } });
    await renderPage();
    const button = screen.getByRole("button", { name: "Отклонить" });
    const form = button.closest("form");
    if (!form) throw new Error("Action form missing");
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "Нарушений нет" } });
    fireEvent.click(button);
    await waitFor(() => expect(mockState.dismissReport).toHaveBeenCalledWith("r1", "Нарушений нет"));
  });
  it("renders a deleted Message and a deleted sender with no broken link or suspension", async () => {
    mockDetail(messageReport({ available: false, label: "Сообщение удалено или недоступно", messageBody: undefined, sender: { available: false, label: "Пользователь удалён" } }));
    await renderPage();
    expect(screen.getByText("Сообщение удалено или недоступно")).toBeDefined();
    expect(screen.getByText("Пользователь удалён")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Заблокировать пользователя" })).toBeNull();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeDefined();
  });
  it("keeps a missing Message with a live sender readable and links to that sender", async () => {
    mockDetail(messageReport({ available: false, label: "Сообщение удалено или недоступно", messageBody: undefined }));
    await renderPage();
    expect(screen.getByText("Сообщение удалено или недоступно")).toBeDefined();
    expect(screen.getByRole("link", { name: "Борис" }).getAttribute("href")).toBe("/users/sender-1");
  });
  it("keeps the reported Message readable after its sender is deleted and offers only dismissal", async () => {
    mockDetail(messageReport({ sender: { available: false, label: "Пользователь удалён" } }));
    await renderPage();
    expect(screen.getByText("Текст жалобы <script>bad()</script>")).toBeDefined();
    expect(screen.getByText("Пользователь удалён")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Заблокировать пользователя" })).toBeNull();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeDefined();
  });
  it("shows suspension failure and disables action during the request", async () => {
    mockDetail(messageReport());
    let finish!: (value: unknown) => void;
    mockState.suspendUser.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await renderPage();
    const button = screen.getByRole("button", { name: "Заблокировать пользователя" });
    const form = button.closest("form");
    if (!form) throw new Error("Action form missing");
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "Спам" } });
    fireEvent.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    finish({ ok: false, error: "Не удалось заблокировать", code: "FORBIDDEN" });
    await waitFor(() => expect(screen.getByText("Не удалось заблокировать")).toBeDefined());
    expect(mockState.refresh).toHaveBeenCalled();
  });
  it("keeps Message content readable with moderation disabled and hides mutation controls", async () => {
    mockDetail(messageReport(), false);
    await renderPage();
    expect(screen.getByText("Текст жалобы <script>bad()</script>")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Заблокировать пользователя" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отклонить" })).toBeNull();
  });
});

describe("report actions with unreadable configuration", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_MINIO_PUBLIC_URL", "https://media.example.test"); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
  it.each(["listing", "user", "message"] as const)("keeps the %s report readable and hides every moderation action", async (targetType) => {
    const report = targetType === "message" ? messageReport() : userReport(targetType === "listing" ? {
      target: { targetType: "listing", targetId: "l1", available: true, label: "Car", status: "active" },
      targetModerationState: { status: "active", suspendedAt: null },
    } : {});
    mockDetail(report);
    mockState.getConfig.mockResolvedValue({ ok: false, code: "FORBIDDEN", error: "Нет доступа" });
    await renderPage();
    expect(screen.getByText("Автор жалобы:")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    if (targetType === "user") expect(screen.getByRole("img", { name: "Фото профиля" })).toBeDefined();
  });
});
