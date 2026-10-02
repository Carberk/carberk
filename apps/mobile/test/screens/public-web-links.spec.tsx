import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as Linking from "expo-linking";

import { AuthEntryScreen } from "../../components/auth/AuthEntryScreen";
import CabinetScreen from "../../app/(tabs)/services";
import { fireEvent, renderMobile } from "../render";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false }) }));

const profiles = [
  ["staging", "https://staging.autotm.bagtyyar.dev"],
  ["production-smoke", "https://autotm.bagtyyar.dev"],
  ["production", "https://autotm.bagtyyar.dev"],
] as const;
const eas = JSON.parse(readFileSync(resolve(__dirname, "../../eas.json"), "utf8"));

afterEach(() => vi.unstubAllEnvs());

describe.each(profiles)("%s public web links", (profile, baseUrl) => {
  it("supplies the public web URL in the build profile", () => {
    expect(eas.build[profile].env.EXPO_PUBLIC_WEB_URL).toBe(baseUrl);
  });

  it.each(["en", "ru", "tk"])("opens localized privacy, terms and posting rules from Cabinet and sign-in in %s", (locale) => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", baseUrl);
    const cabinet = renderMobile(<CabinetScreen />, { locale });
    fireEvent.press(cabinet.getByRole("button", { name: cabinet.i18n.t("account:privacyPolicy") }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${baseUrl}/${locale}/legal/privacy`);
    fireEvent.press(cabinet.getByRole("button", { name: cabinet.i18n.t("account:termsOfService") }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${baseUrl}/${locale}/legal/terms`);
    fireEvent.press(cabinet.getByRole("button", { name: cabinet.i18n.t("account:postingRules") }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${baseUrl}/${locale}/legal/posting-rules`);
    cabinet.unmount();

    const auth = renderMobile(<AuthEntryScreen method="email" title="Sign in" helper="Email" canSubmit={false} isSubmitting={false} onSubmit={async () => {}}>{null}</AuthEntryScreen>, { locale });
    fireEvent.press(auth.getByText(auth.i18n.t("auth:privacy")));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${baseUrl}/${locale}/legal/privacy`);
    fireEvent.press(auth.getByText(auth.i18n.t("auth:terms")));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`${baseUrl}/${locale}/legal/terms`);
  });
});
