import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeleteAccountScreen from "../../app/account/delete";
import DeletionScheduledScreen from "../../app/account/deletion-scheduled";
import { act, fireEvent, renderMobile, routerMock } from "../render";

const api = vi.hoisted(() => ({ delete: vi.fn() }));
const session = vi.hoisted(() => ({ clearAuthSession: vi.fn() }));

vi.mock("../../src/api/client", () => ({ apiClient: api }));
vi.mock("../../src/auth/session", () => session);

// 2 October 2026 at noon UTC; the deletion lands 30 days later, on 1 November.
const NOW = new Date("2026-10-02T12:00:00.000Z");
const DATES = { en: "November 1, 2026", ru: "1 ноября 2026 г", tk: "1 noýabr 2026" } as const;
// Where the date opens a sentence, Russian keeps the period of "г.".
const ERASED_ON_DATES = { ...DATES, ru: "1 ноября 2026 г." } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.delete.mockReset().mockResolvedValue({ success: true });
  session.clearAuthSession.mockReset().mockResolvedValue(undefined);
  routerMock.canGoBack.mockImplementation(() => true);
});

afterEach(() => vi.useRealTimers());

function deleteButton(screen: Awaited<ReturnType<typeof renderMobile>>) {
  return screen.getByRole("button", { name: screen.i18n.t("account:deleteAccount") });
}

function understand(screen: Awaited<ReturnType<typeof renderMobile>>, checked: boolean) {
  return screen.getByRole("checkbox", { name: screen.i18n.t("account:deleteAccountUnderstand"), checked });
}

async function confirmDeletion(screen: Awaited<ReturnType<typeof renderMobile>>) {
  await fireEvent.press(understand(screen, false));
  await fireEvent.press(deleteButton(screen));
  await act(async () => {
    void fireEvent.press(screen.getByText(screen.i18n.t("account:deleteAccountConfirmAction")));
  });
}

describe("Delete account screen", () => {
  it.each(["en", "ru", "tk"] as const)("explains what happens with the date 30 days from today in %s", async (locale) => {
    const screen = await renderMobile(<DeleteAccountScreen />, { locale });
    const t = screen.i18n.t;

    expect(screen.getByText(t("account:deleteAccountDescription"))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountWhatHappens"))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountSignedOut"))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountListingsArchived"))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountChatsStay"))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountErasedOn", { date: ERASED_ON_DATES[locale] }))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountRestoreBefore"))).toBeTruthy();
  });

  it("keeps Delete account disabled, for screen readers too, until I understand is ticked", async () => {
    const screen = await renderMobile(<DeleteAccountScreen />);

    expect(deleteButton(screen).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(deleteButton(screen));
    expect(screen.queryByText(screen.i18n.t("account:deleteAccountConfirmTitle"))).toBeNull();

    await fireEvent.press(understand(screen, false));

    expect(understand(screen, true)).toBeTruthy();
    expect(deleteButton(screen).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("asks in a dialog with the date, and Cancel changes nothing", async () => {
    const screen = await renderMobile(<DeleteAccountScreen />);
    const t = screen.i18n.t;

    await fireEvent.press(understand(screen, false));
    await fireEvent.press(deleteButton(screen));
    expect(screen.getByText(t("account:deleteAccountConfirmDescription", { date: DATES.en }))).toBeTruthy();

    await fireEvent.press(screen.getByText(t("account:deleteAccountCancel")));

    expect(screen.queryByText(t("account:deleteAccountConfirmTitle"))).toBeNull();
    expect(api.delete).not.toHaveBeenCalled();
    expect(session.clearAuthSession).not.toHaveBeenCalled();
    expect(understand(screen, true)).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("deletes with the session alone, clears the session and cache, and opens the scheduled screen over Cabinet", async () => {
    const screen = await renderMobile(<DeleteAccountScreen />);
    screen.queryClient.setQueryData(["me"], { id: "user-1" });

    await confirmDeletion(screen);

    expect(api.delete).toHaveBeenCalledOnce();
    expect(api.delete.mock.calls[0]?.[0]).toBe("/me");
    expect(session.clearAuthSession).toHaveBeenCalledOnce();
    expect(screen.queryClient.getQueryData(["me"])).toBeUndefined();
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/services");
    expect(routerMock.push).toHaveBeenCalledWith("/account/deletion-scheduled");
    expect(session.clearAuthSession.mock.invocationCallOrder[0])
      .toBeLessThan(routerMock.dismissTo.mock.invocationCallOrder[0] ?? 0);
    expect(routerMock.dismissTo.mock.invocationCallOrder[0])
      .toBeLessThan(routerMock.push.mock.invocationCallOrder[0] ?? 0);
  });

  it("keeps the User signed in on the screen and shows the error when deletion fails", async () => {
    api.delete.mockRejectedValue(new Error("network"));
    const screen = await renderMobile(<DeleteAccountScreen />);

    await confirmDeletion(screen);

    // TanStack Query notifies observers on a timer, so the error can land after act settles.
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(screen.i18n.t("account:deleteAccountFailed"))).toBeTruthy();
    expect(session.clearAuthSession).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("opens again with no old error and an unticked box", async () => {
    api.delete.mockRejectedValue(new Error("network"));
    const first = await renderMobile(<DeleteAccountScreen />);
    await confirmDeletion(first);
    expect(await first.findByRole("alert")).toBeTruthy();
    await first.unmount();

    const again = await renderMobile(<DeleteAccountScreen />);

    expect(again.queryByRole("alert")).toBeNull();
    expect(understand(again, false)).toBeTruthy();
  });

  it("goes Back to Profile, or opens Profile when there is no previous screen", async () => {
    const screen = await renderMobile(<DeleteAccountScreen />);
    const back = screen.getByRole("button", { name: screen.i18n.t("common:back") });

    await fireEvent.press(back);
    expect(routerMock.back).toHaveBeenCalledOnce();

    routerMock.canGoBack.mockImplementation(() => false);
    await fireEvent.press(back);
    expect(routerMock.replace).toHaveBeenCalledWith("/profile");
  });
});

describe("Account scheduled for deletion screen", () => {
  it.each(["en", "ru", "tk"] as const)("shows the deletion date in %s and Done opens Cabinet", async (locale) => {
    const screen = await renderMobile(<DeletionScheduledScreen />, { locale });
    const t = screen.i18n.t;

    expect(screen.getByText(t("account:deleteAccountScheduledTitle"))).toBeTruthy();
    expect(screen.getByText(t("account:deleteAccountScheduledMessage", { date: DATES[locale] }))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("common:back") })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: t("common:done") }));

    expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/services");
  });
});
