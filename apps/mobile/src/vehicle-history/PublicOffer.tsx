import { useRef, useState } from "react";
import { AccessibilityInfo, Modal, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { fictionalSample } from "./fictionalSample";
import { vehicleHistoryAvailable } from "./availability";
import { saveFictionalSample } from "./saveFictionalSample";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useSafeBack } from "@/src/navigation/useSafeBack";

export function PublicOffer({ listingId }: { listingId?: string }) {
  const { t } = useTranslation();
  const back = useSafeBack();
  const [sampleOpen, setSampleOpen] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "saving" | "failed">("idle");
  const saving = useRef(false);
  const sampleClose = useRef<View>(null);
  const sampleTrigger = useRef<View>(null);
  const available = vehicleHistoryAvailable();
  const closeSample = () => {
    setSampleOpen(false);
    AccessibilityInfo.announceForAccessibility(t("vehicleHistory.title"));
  };
  const download = async () => {
    if (saving.current) return;
    saving.current = true;
    setDownloadState("saving");
    try {
      await saveFictionalSample();
      setDownloadState("idle");
    } catch {
      setDownloadState("failed");
      AccessibilityInfo.announceForAccessibility(t("vehicleHistory.downloadFailed"));
    } finally {
      saving.current = false;
    }
  };
  return (
    <SafeScreen>
      <StackHeader large title={t("vehicleHistory.title")}
        leading={<BackButton onPress={back} accessibilityLabel={t("back")} />} />
      {!available ? (
        <View className="gap-4 px-5 py-6">
          <Text accessibilityRole="alert">{t("vehicleHistory.unavailable")}</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pb-8 pt-3">
          <Text className="text-body leading-6">{t("vehicleHistory.intro")}</Text>
          {listingId && <Text className="text-callout text-muted-foreground">{t("vehicleHistory.listingContext")}</Text>}
          <View className="gap-3">
            <Text accessibilityRole="header" className="font-heading text-headline font-semibold">{t("vehicleHistory.price")}</Text>
            <Text className="text-body leading-6">{t("vehicleHistory.providers")}</Text>
          </View>
          <View className="gap-3">
            <Text className="text-callout leading-6 text-muted-foreground">{t("vehicleHistory.coverage")}</Text>
            <Text className="text-callout leading-6 text-muted-foreground">{t("vehicleHistory.condition")}</Text>
          </View>
          <Button ref={sampleTrigger} onPress={() => { setDownloadState("idle"); setSampleOpen(true); }}>
            <Text>{t("vehicleHistory.viewSample")}</Text>
          </Button>
          <Separator />
          <View className="gap-3">
            <Text className="text-callout text-muted-foreground">{t("vehicleHistory.outside")}</Text>
            <Text className="text-callout text-muted-foreground">{t("vehicleHistory.hours")}</Text>
            <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.informationOnly")}</Text>
          </View>
        </ScrollView>
      )}
      <Modal visible={available && sampleOpen} animationType="slide" presentationStyle="fullScreen"
        onRequestClose={closeSample}
        onDismiss={() => {
          if (sampleTrigger.current) AccessibilityInfo.sendAccessibilityEvent(sampleTrigger.current, "focus");
        }}
        onShow={() => {
          if (sampleClose.current) AccessibilityInfo.sendAccessibilityEvent(sampleClose.current, "focus");
          AccessibilityInfo.announceForAccessibility(t("vehicleHistory.sampleTitle"));
        }}>
        <SafeScreen accessibilityViewIsModal>
          <StackHeader large title={t("vehicleHistory.sampleTitle")}
            leading={<BackButton ref={sampleClose} kind="close" onPress={closeSample} accessibilityLabel={t("close")} />} />
          <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-8 pt-3">
            <Text className="text-callout font-medium">{t("vehicleHistory.fictionNotice")}</Text>
            <Text className="text-callout text-muted-foreground">{t("vehicleHistory.originalLanguage")}</Text>
            <View className="gap-4 rounded-2xl border-hairline border-border bg-card p-4">
              {fictionalSample.split("\n\n").map((line, index) => (
                <Text key={line} selectable accessibilityLanguage="en" accessibilityRole={index === 0 ? "header" : undefined}
                  className={index === 0 ? "text-subhead font-semibold" : "text-callout leading-6"}>{line}</Text>
              ))}
            </View>
            {downloadState === "failed" && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-callout text-destructive">
                {t("vehicleHistory.downloadFailed")}
              </Text>
            )}
            <Button disabled={downloadState === "saving"} accessibilityState={{ busy: downloadState === "saving" }} onPress={() => void download()}>
              <Text>{t(downloadState === "saving" ? "vehicleHistory.saving" : downloadState === "failed" ? "vehicleHistory.retryDownload" : "vehicleHistory.download")}</Text>
            </Button>
            <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.saveHint")}</Text>
            <Button variant="secondary" onPress={closeSample}><Text>{t("close")}</Text></Button>
          </ScrollView>
        </SafeScreen>
      </Modal>
    </SafeScreen>
  );
}
