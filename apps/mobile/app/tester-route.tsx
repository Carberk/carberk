import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../src/api/client";
import { captureRouteSnapshot, gatewayConfigured, gatewayTesterEnabled, provisionGatewayKey, removeGatewayKey, selectTesterRoute, type RouteEntry } from "../src/api/routes";
import { useSafeBack } from "../src/navigation/useSafeBack";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/** Private development route, opened by testers at /tester-route. No URL credentials. */
export default function TesterRouteScreen() {
  return gatewayTesterEnabled() ? <TesterControls /> : null;
}

function TesterControls() {
  const { t } = useTranslation(["account", "common"]);
  const back = useSafeBack("/(tabs)/services");
  const [entry, setEntry] = useState(captureRouteSnapshot().entry);
  const [configured, setConfigured] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState<"saveFailed" | "failed" | "connected" | null>(null);
  useEffect(() => {
    let active = true;
    void gatewayConfigured().then(value => { if (active) setConfigured(value); })
      .catch(() => { if (active) setStatus("saveFailed"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const choose = (value: RouteEntry) => {
    selectTesterRoute(value); setEntry(value); setStatus(null);
  };
  const save = async () => {
    setBusy(true); setStatus(null);
    const submitted = key; setKey("");
    try { await provisionGatewayKey(submitted); setConfigured(true); }
    catch { setStatus("saveFailed"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setStatus(null);
    try { await removeGatewayKey(); setConfigured(false); setEntry("global"); }
    catch { setStatus("saveFailed"); }
    finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setStatus(null);
    try {
      await apiClient.get("/listings?limit=1", ListingsSchemas.FeedResponseSchema, { auth: false, timeout: 10_000 });
      setStatus("connected");
    } catch { setStatus("failed"); }
    finally { setBusy(false); }
  };

  return (
    <SafeScreen>
      <StackHeader large title={t("testerRoute.title")} leading={<BackButton onPress={back} accessibilityLabel={t("common:back")} />} />
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pb-8 pt-2" keyboardShouldPersistTaps="handled">
        <View className="gap-3">
          <Text className="text-body text-muted-foreground">{t("testerRoute.scope")}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t("testerRoute.title")} className="gap-2">
            {(["global", "tm"] as const).map(value => (
              <Button key={value} variant={entry === value ? "secondary" : "outline"} role="radio"
                accessibilityState={{ checked: entry === value, disabled: busy || (value === "tm" && !configured) }}
                disabled={busy || (value === "tm" && !configured)} onPress={() => choose(value)}>
                <Text>{t(`testerRoute.${value}`)}</Text>
              </Button>
            ))}
          </View>
          <Text className="text-footnote text-muted-foreground">{t("testerRoute.reset")}</Text>
        </View>
        <View className="gap-3">
          <Text className="text-body">{t(`testerRoute.${configured ? "configured" : "unconfigured"}`)}</Text>
          <Input accessibilityLabel={t("testerRoute.key")} placeholder={t("testerRoute.key")} secureTextEntry
            autoCapitalize="none" autoCorrect={false} textContentType="none" autoComplete="off" value={key} onChangeText={setKey} editable={!busy} />
          <Button disabled={busy || !key} onPress={() => void save()}><Text>{t("testerRoute.save")}</Text></Button>
          {configured ? <Button variant="ghost" disabled={busy} onPress={() => void remove()}><Text>{t("testerRoute.remove")}</Text></Button> : null}
        </View>
        <View className="gap-3">
          <Button variant="outline" disabled={busy} onPress={() => void check()}><Text>{t("testerRoute.check")}</Text></Button>
          {busy ? <Text accessibilityLiveRegion="polite" className="text-callout text-muted-foreground">{t("common:loading")}</Text> : null}
          {status ? <Text accessibilityRole={status === "connected" ? "text" : "alert"} accessibilityLiveRegion="polite"
            className={status === "connected" ? "text-callout text-foreground" : "text-callout text-destructive"}>{t(`testerRoute.${status}`)}</Text> : null}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}
