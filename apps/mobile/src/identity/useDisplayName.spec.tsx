import { describe, expect, it } from "vitest";

import { act, renderMobile } from "../../test/render";

import { useDisplayName, type NamedUser } from "./useDisplayName";

import { Text } from "@/components/ui/text";

function Name({ user }: { user: NamedUser }) {
  const displayNameOf = useDisplayName();
  return <Text>{displayNameOf(user)}</Text>;
}

describe("useDisplayName", () => {
  it.each([
    ["en", "Driver 4821"],
    ["ru", "Водитель 4821"],
    ["tk", "Sürüji 4821"],
  ])("gives a User without a name the generated one in %s", async (locale, name) => {
    const view = await renderMobile(<Name user={{ displayName: null, nameNumber: 4821 }} />, { locale });
    expect(view.getByText(name)).toBeTruthy();
  });

  it("follows the app language without a reload", async () => {
    const view = await renderMobile(<Name user={{ displayName: null, nameNumber: 4821 }} />);
    expect(view.getByText("Driver 4821")).toBeTruthy();
    await act(async () => { await view.i18n.changeLanguage("tk"); });
    expect(view.getByText("Sürüji 4821")).toBeTruthy();
    expect(view.queryByText("Driver 4821")).toBeNull();
  });

  it.each(["en", "ru", "tk"])("gives the name the User set, whatever the language (%s)", async (locale) => {
    const view = await renderMobile(<Name user={{ displayName: "Aman", nameNumber: 4821 }} />, { locale });
    expect(view.getByText("Aman")).toBeTruthy();
  });

  it("treats a name of only spaces as no name", async () => {
    const view = await renderMobile(<Name user={{ displayName: "   ", nameNumber: 2057 }} />);
    expect(view.getByText("Driver 2057")).toBeTruthy();
  });
});
