import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, Platform, View } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useTranslation } from "react-i18next";
import type { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";

import { ApiError } from "../api/client";
import { historyTranscript } from "../api/vehicle-history/messages";
import { localeTag } from "../i18n/resources";

import { presentReportPdf, type PdfAction } from "./presentReportPdf";
import { assertHistorySession, historySessionCurrent, type HistoryViewer } from "./session";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

type Action = PdfAction | "openLink" | "copyLink";
type Report = R.HistoryReportView & { status: "delivered" };
type State = { status: "loading" | "empty" | "denied" | "failed" } | Report;
const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

export function DeliveredReport({ viewer, requestId, active, online, ready, openComposer }: {
  viewer: HistoryViewer; requestId: string; active: boolean; online: boolean; ready: boolean; openComposer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const routeFocused = useIsFocused();
  const copy = (key: string) => t(`vehicleHistory.${key}`);
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<Action | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<"linkCopied" | "reportLinkFailed" | "reportCopyFailed" | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const operation = useRef<Action | null>(null);
  const reader = useRef({ alive: true, active, online, ready, routeFocused, generation: 0 });
  if (reader.current.active && !active || reader.current.online && !online) reader.current.generation++;
  reader.current = { ...reader.current, active, online, ready, routeFocused };
  const controller = useMemo(() => new AbortController(), []);
  const { userId, sessionId } = viewer;
  const api = useMemo(() => historyTranscript({ userId, sessionId }, requestId, controller.signal), [userId, sessionId, requestId, controller]);
  useEffect(() => focusManager.subscribe(() => {
    if (!focusManager.isFocused()) reader.current.generation++;
  }), []);
  useEffect(() => () => { reader.current.alive = false; controller.abort(); }, [controller]);
  useLayoutEffect(() => {
    if (!active || !online) return;
    let reading = true;
    const applicable = () => reading && reader.current.alive && reader.current.active && reader.current.online;
    setState({ status: "loading" });
    void api.report(applicable).then(
      (result) => { if (applicable()) setState(result); },
      (error: unknown) => { if (applicable()) setState({ status: denied(error) ? "denied" : "failed" }); },
    );
    return () => { reading = false; };
  }, [active, online, api, retry]);

  const run = async (action: Action, report: Report) => {
    const { generation } = reader.current;
    const ownsRoute = () => reader.current.alive && reader.current.routeFocused && historySessionCurrent(viewer);
    const visible = () => ownsRoute() && reader.current.active && reader.current.online
      && AppState.currentState === "active" && focusManager.isFocused() && onlineManager.isOnline();
    const current = () => reader.current.generation === generation && visible();
    if (operation.current || !reader.current.ready || !current()) return;
    operation.current = action;
    setBusy(action);
    let pickerOpened = false;
    const confirm = async (phase?: "picker" | "destination") => {
      await assertHistorySession(viewer, controller.signal);
      const applicable = phase === "destination" ? ownsRoute() : current() && reader.current.ready;
      if (!applicable) throw new ApiError("HISTORY_READER_CHANGED", 409);
      if (phase === "picker") pickerOpened = true;
    };
    const link = action === "openLink" || action === "copyLink";
    if (link) setLinkFeedback(null);
    else setPdfFailed(false);
    try {
      const { artifact } = report;
      if (link) {
        const { address } = await api.reportLink(artifact.id, current);
        await confirm();
        if (action === "openLink") await Linking.openURL(address);
        else {
          if (!await Clipboard.setStringAsync(address)) throw new Error("Clipboard unavailable");
          if (current()) {
            setLinkFeedback("linkCopied");
            if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(copy("linkCopied"));
          }
        }
      } else if (artifact.format !== "link") {
        const { dataBase64 } = await api.reportPdf(artifact.id, current);
        await confirm();
        await presentReportPdf(action, artifact.pdf, dataBase64, confirm);
      }
    } catch (error) {
      if (current() || (pickerOpened && ownsRoute())) {
        if (denied(error)) setState({ status: "denied" });
        else if (link) setLinkFeedback(action === "openLink" ? "reportLinkFailed" : "reportCopyFailed");
        else setPdfFailed(true);
      }
    } finally {
      operation.current = null;
      if (reader.current.alive) setBusy(null);
    }
  };

  if (!active || !historySessionCurrent(viewer)) return null;
  const button = (action: Action, label: string, report: Report, primary = false) =>
    <Button className="min-h-12" variant={primary ? "default" : "secondary"}
      disabled={!ready || busy !== null} accessibilityState={{ busy: busy === action }}
      onPress={() => { void run(action, report); }}><Text>{copy(label)}</Text></Button>;

  return <View className="gap-3 rounded-xl border border-border bg-card p-4">
    <Text accessibilityRole="header" className="text-headline font-semibold">{copy(online && state.status === "delivered" ? "reportReady" : "reportTitle")}</Text>
    {!online ? <Text accessibilityRole="alert">{copy("offline")}</Text>
      : state.status === "loading" ? <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
        <ActivityIndicator /><Text>{copy("reportLoading")}</Text>
      </View>
      : state.status === "delivered" ? <>
        {state.artifact.format === "link" ? button("openLink", "openReport", state, true) : button("open", "reportOpenPdf", state, true)}
        <View className="gap-1">
          <Text className="text-body font-semibold">{state.artifact.report.provider}</Text>
          <Text selectable className="font-mono text-callout">VIN {state.artifact.report.vin}</Text>
          <Text className="text-callout text-muted-foreground">{t("vehicleHistory.reportDate", { date: state.artifact.report.originalReportDate })}</Text>
        </View>
        <Text className="text-callout">{copy("reportFreeReopen")}</Text>
        {state.artifact.format !== "link" && <View className="gap-2">
          <Text selectable className="text-callout">{state.artifact.pdf.filename}</Text>
          <Text className="text-footnote text-muted-foreground">{t("vehicleHistory.reportSize", {
            size: Intl.NumberFormat(localeTag(i18n.language), { maximumFractionDigits: 1 }).format(state.artifact.pdf.sizeBytes / 1024),
          })}</Text>
          {button("download", "reportDownloadPdf", state)}
          {state.artifact.report.permittedUse && button("share", "reportSharePdf", state)}
          {pdfFailed && <Text accessibilityRole="alert">{copy("reportPdfFailed")}</Text>}
        </View>}
        {state.artifact.format !== "pdf" && <View className="gap-2">
          {state.artifact.format === "both" && button("openLink", "openReport", state)}
          {button("copyLink", "copyLink", state)}
          {linkFeedback && <Text accessibilityRole={linkFeedback === "linkCopied" ? "text" : "alert"}
            accessibilityLiveRegion="polite">{copy(linkFeedback)}</Text>}
          {!linkFeedback && <Text className="text-footnote text-muted-foreground">{copy("reportLinkHelp")}</Text>}
        </View>}
        {(pdfFailed || state.artifact.format !== "pdf") && <Button variant="ghost" className="min-h-12" disabled={!ready}
          onPress={openComposer}><Text>{copy("reportContact")}</Text></Button>}
      </> : <>
        <Text accessibilityRole="alert">{copy(state.status === "denied" ? "denied" : state.status === "empty" ? "reportEmpty" : "reportReadFailed")}</Text>
        <Button variant="secondary" className="min-h-12" onPress={() => setRetry((value) => value + 1)}><Text>{t("retry")}</Text></Button>
      </>}
  </View>;
}
