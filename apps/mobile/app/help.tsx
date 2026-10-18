import { useState } from "react";
import { ScrollView } from "react-native";
import { Mail, Phone } from "lucide-react-native";
import * as Linking from "expo-linking";
import { useTranslation } from "react-i18next";

import { SupportEntry } from "../src/services/SupportEntry";
import { supportContacts } from "../src/config/supportContacts";
import { useSafeBack } from "../src/navigation/useSafeBack";

import { MenuDivider, MenuFooter, MenuGroup, MenuRow } from "@/components/account/MenuRow";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Text } from "@/components/ui/text";

type Channel = "email" | "phone";

export default function HelpScreen() {
  const { t } = useTranslation(["support", "common"]);
  const goBack = useSafeBack("/(tabs)/services");
  const [failed, setFailed] = useState<Channel | null>(null);

  const open = async (channel: Channel, url: string) => {
    setFailed(null);
    try {
      await Linking.openURL(url);
    } catch {
      // No mail app or dialer on this device. The value is shown for copying.
      setFailed(channel);
    }
  };

  return (
    <SafeScreen>
      <StackHeader
        large
        title={t("help")}
        leading={<BackButton onPress={goBack} accessibilityLabel={t("common:back")} />}
      />

      <ScrollView className="flex-1" contentContainerClassName="pb-6 pt-1">
        <SupportEntry/>
        {/* Each row reads its label, then the address or number, as before. */}
        <MenuGroup>
          <MenuRow
            icon={Mail}
            label={t("emailUs")}
            sub={supportContacts.email}
            onPress={() => void open("email", `mailto:${supportContacts.email}`)}
          />
          <MenuDivider />
          <MenuRow
            icon={Phone}
            label={t("callUs")}
            sub={supportContacts.phoneShown}
            onPress={() => void open("phone", `tel:${supportContacts.phoneDialled}`)}
          />
        </MenuGroup>

        {failed ? (
          // Outside the pressable rows, so a long press selects the value.
          <MenuFooter className="gap-1 pt-3">
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="text-callout text-destructive"
            >
              {t(failed === "email" ? "noMailApp" : "noDialer")}
            </Text>
            <Text selectable className="text-body text-foreground">
              {failed === "email" ? supportContacts.email : supportContacts.phoneShown}
            </Text>
          </MenuFooter>
        ) : null}

        <MenuFooter>
          <Text className="text-footnote text-muted-foreground">{t("includeV")}</Text>
        </MenuFooter>
      </ScrollView>
    </SafeScreen>
  );
}
