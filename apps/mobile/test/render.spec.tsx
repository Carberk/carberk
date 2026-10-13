import { useState } from "react";
import { View, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../components/ui/button";
import { Text } from "../components/ui/text";

import { renderMobile, routerMock } from "./render";

function Example() {
  const router = useRouter();
  const { t } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const { data } = useQuery({ queryKey: ["example"], queryFn: async () => "Loaded" });
  return <View className="gap-3"><TextInput accessibilityLabel="Name" />
    <Button onPress={() => { setPressed(true); router.push("/profile"); }}><Text>{t("save")}</Text></Button>
    {pressed && <Text>Saved</Text>}{data && <Text>{data}</Text>}
  </View>;
}

describe("mobile renderer", () => {
  it("does not dispatch a press to a disabled native button", async () => {
    const onPress = vi.fn();
    const screen = await renderMobile(<Button disabled onPress={onPress}><Text>Save</Text></Button>);
    await fireEvent.press(screen.getByRole("button", { name: "Save", disabled: true }));
    expect(onPress).not.toHaveBeenCalled();
  });
  it("queries native roles, labels and translated text and presses a real component", async () => {
    const screen = await renderMobile(<Example />);
    expect(screen.getByLabelText("Name")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(routerMock.push).toHaveBeenCalledWith("/profile");
    await screen.rerender(<Example />);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(await screen.findByText("Loaded")).toBeTruthy();
  });
});
