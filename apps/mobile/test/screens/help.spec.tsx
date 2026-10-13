import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import * as Linking from "expo-linking";
import { describe, expect, it, vi } from "vitest";

import HelpScreen from "../../app/help";
import { act, fireEvent, renderMobile, routerMock } from "../render";

const email = "bagtyyarkowusow.dev@gmail.com";
const shownPhone = "+993 63 98 94 04";

describe("Help", () => {
  it("shows Email us and Call us with the contacts and what to include", async () => {
    const screen = await renderMobile(<HelpScreen />);

    expect(screen.getByText("Help")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Email us, ${email}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Call us, ${shownPhone}` })).toBeTruthy();
    expect(
      screen.getByText("Tell us the listing number, for example No. 123456, and what happened."),
    ).toBeTruthy();
  });

  it("opens the mail app and the dialer", async () => {
    const screen = await renderMobile(<HelpScreen />);

    await fireEvent.press(screen.getByRole("button", { name: `Email us, ${email}` }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(`mailto:${email}`);
    await fireEvent.press(screen.getByRole("button", { name: `Call us, ${shownPhone}` }));
    expect(Linking.openURL).toHaveBeenLastCalledWith("tel:+99363989404");
  });

  it.each([
    ["Email us", email, "Couldn't open a mail app. Copy the address:"],
    ["Call us", shownPhone, "Couldn't open the dialer. Copy the number:"],
  ])("explains when %s cannot open and keeps the contact selectable", async (label, value, message) => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No activity found"));
    const screen = await renderMobile(<HelpScreen />);

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: `${label}, ${value}` }));
    });

    expect(screen.getByRole("alert").props.children).toBe(message);
    // The row still reads the value; a selectable copy sits outside any pressable.
    const copies = screen.getAllByText(value);
    expect(copies).toHaveLength(2);
    expect(copies.filter((copy) => copy.props.selectable)).toHaveLength(1);
  });

  it("offers nothing but Back, Email us and Call us", async () => {
    const screen = await renderMobile(<HelpScreen />);

    expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual([
      "Back",
      `Email us, ${email}`,
      `Call us, ${shownPhone}`,
    ]);
    expect(screen.queryByText(/chat|hours|respond|reply/i)).toBeNull();
  });

  it("goes back to Cabinet", async () => {
    const screen = await renderMobile(<HelpScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });

  it.each([
    ["ru", "Помощь", "Написать на почту", "Позвонить нам", "Укажите номер объявления, например № 123456, и что произошло."],
    ["tk", "Kömek", "E-poçta ýaz", "Bize jaň et", "Bildiriş belgisini, mysal üçin № 123456, we näme bolandygyny ýazyň."],
  ])("reads in %s", async (locale, title, emailUs, callUs, include) => {
    const screen = await renderMobile(<HelpScreen />, { locale });

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(emailUs)).toBeTruthy();
    expect(screen.getByText(callUs)).toBeTruthy();
    expect(screen.getByText(include)).toBeTruthy();
  });
});

describe("support contacts", () => {
  // Structural check: the values live in one file so a change cannot miss a copy.
  it("exist only in src/config/supportContacts.ts, and only Cabinet and the code limit entry open Help", () => {
    const root = resolve(__dirname, "../..");
    const skip = new Set(["node_modules", ".expo", "dist", "ios", "android"]);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (skip.has(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|jsx?|json)$/.test(name)) files.push(path);
      }
    };
    walk(root);

    const holders = files
      .filter((file) => !file.endsWith(".spec.ts") && !file.endsWith(".spec.tsx"))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return [email, shownPhone, "99363989404", "63 98 94 04"].some((value) => text.includes(value));
      })
      .map((file) => relative(root, file));

    expect(holders).toEqual(["src/config/supportContacts.ts"]);

    // Cabinet opens Help, and so does the approved Sign-in Code limit entry (#526) through HELP_HREF.
    const linkers = files
      .filter((file) => !/\.spec\.tsx?$/.test(file))
      .filter((file) => /["'`]\/help["'`]/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    expect(linkers).toEqual(["app/(tabs)/services.tsx", "src/navigation/helpHref.ts"]);
  });
});
