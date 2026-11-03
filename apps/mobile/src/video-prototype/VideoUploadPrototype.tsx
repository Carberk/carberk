import { useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { usePrototypeCopy } from "./copy";
import { SYNTHETIC_CLIPS, type SyntheticClip } from "./fixtures";
import type { LocalVideoAdapter } from "./localAdapter";
import {
  createInitialVideoPrototypeState, selectionError, videoPrototypeReducer,
  type JobPhase, type PreparedClip,
} from "./state";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

function Action({ label, ...props }: ButtonProps & { label: string }) {
  return <Button variant="secondary" accessibilityLabel={label} {...props}><Text>{label}</Text></Button>;
}

/** Local storyboard shapes, never images fetched from a media host. */
function Frame({ atSeconds, carX, label }: { atSeconds: number; carX: number; label: string }) {
  return <View accessible accessibilityLabel={label} className="flex-1 overflow-hidden rounded-md bg-secondary p-2">
    <View className="h-10 justify-end border-b border-foreground/50">
      <View style={{ transform: [{ translateX: carX / 4 }] }}>
        <View className="ml-2 h-2 w-5 rounded-t-md bg-foreground/50" />
        <View className="h-3 w-9 rounded-md bg-foreground/70" />
      </View>
    </View>
    <Text className="text-center font-mono text-caption">{atSeconds}s</Text>
  </View>;
}

function Timeline({ source, onPoster, start, end }: {
  source: SyntheticClip; start: number; end: number; onPoster?: (seconds: number) => void;
}) {
  const t = usePrototypeCopy();
  return <View className="gap-2">
    <Text variant="label">{t("timeline")}</Text>
    <View className="flex-row gap-1">
      {source.frames.map((frame) => onPoster ? (
        <Button key={frame.atSeconds} variant="outline" className="flex-1 p-0"
          disabled={frame.atSeconds < start || frame.atSeconds > end}
          accessibilityLabel={t("chooseFrame", { seconds: frame.atSeconds })}
          onPress={() => onPoster(frame.atSeconds)}>
          <Frame {...frame} label={t("frame", { seconds: frame.atSeconds })} />
        </Button>
      ) : <Frame key={frame.atSeconds} {...frame} label={t("frame", { seconds: frame.atSeconds })} />)}
    </View>
  </View>;
}

export function VideoUploadPrototype({ adapter }: { adapter: LocalVideoAdapter }) {
  const t = usePrototypeCopy();
  const [state, dispatch] = useReducer(videoPrototypeReducer, undefined, createInitialVideoPrototypeState);
  const [preparingBusy, setPreparingBusy] = useState(false);
  const epoch = useRef(0);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => () => {
    epoch.current += 1;
    const { pending, active } = latest.current;
    if (pending?.prepared) adapter.discard(pending.prepared);
    if (active) adapter.discard(active.prepared);
  }, [adapter]);

  const pending = state.pending;
  const phase = state.libraryOpen ? "selection" : pending?.phase ?? (state.active ? "ready" : "empty");
  const error = pending ? selectionError(pending.source, pending.selection) : null;
  const canEdit = pending && ["preview", "trim", "poster", "failed"].includes(pending.phase);

  function discardPending() {
    epoch.current += 1;
    setPreparingBusy(false);
    if (pending?.prepared) adapter.discard(pending.prepared);
    dispatch({ type: "remove-pending" });
  }
  function select(source: SyntheticClip) {
    if (state.access !== "eligible") return;
    discardPending();
    // Removing staged data must not close this selection transaction.
    dispatch({ type: "library", open: true });
    dispatch({ type: "select", source });
  }
  function fail(stage: JobPhase) { dispatch({ type: "fail", stage }); }
  async function prepare() {
    if (!pending || pending.phase !== "preparing" || preparingBusy) return;
    if (selectionError(pending.source, pending.selection)) { fail("preparing"); return; }
    const operation = ++epoch.current;
    setPreparingBusy(true);
    let output: PreparedClip | undefined;
    try {
      output = await adapter.prepare(pending.source, pending.selection);
      if (operation !== epoch.current) { adapter.discard(output); return; }
      if (output.kind !== "prepared-descriptor-v1" || !/^[a-f0-9]{64}$/.test(output.sha256) || output.sizeBytes <= 0 || output.sha256 === pending.source.sha256) {
        adapter.discard(output);
        fail("preparing");
        return;
      }
      dispatch({ type: "prepared", output });
    } catch {
      if (operation === epoch.current) fail("preparing");
    } finally {
      if (operation === epoch.current) setPreparingBusy(false);
    }
  }
  function upload() {
    if (pending?.phase !== "uploading" || !pending.prepared) return;
    try {
      const value = adapter.uploadChunk(pending.prepared, pending.progress);
      if (!Number.isFinite(value) || value < pending.progress || value > 100) throw new Error("INVALID_PROGRESS");
      dispatch({ type: "progress", value });
    } catch { fail("uploading"); }
  }
  function finish() {
    if (state.active) adapter.discard(state.active.prepared);
    dispatch({ type: "ready" });
  }

  function editor() {
    if (!pending) return null;
    const { startSeconds: start, endSeconds: end, posterSeconds: poster } = pending.selection;
    const editable = ["preview", "trim", "poster"].includes(pending.phase);
    return <View className="gap-4 rounded-xl border border-border bg-card p-4">
      <Text variant="h3">{t(pending.phase)}</Text>
      <Text testID="selected-interval" className="font-mono text-callout">{t("duration", { start, end, duration: end - start })}</Text>
      <Text testID="selected-poster" variant="muted">{t("posterAt", { seconds: poster })}</Text>
      {editable ? <Timeline source={pending.source} start={start} end={end}
        onPoster={pending.phase === "poster" ? (seconds) => dispatch({ type: "poster", seconds }) : undefined} /> : null}
      {error ? <Text className="text-destructive" accessibilityRole="alert">{t(error === "poster" ? "invalidPoster" : error)}</Text> : null}
      {pending.phase === "preview" ? <>
        <Text variant="muted">{t(pending.source.durationSeconds <= 90 ? "trimOptional" : "trimRequired")}</Text>
        {pending.source.durationSeconds <= 90 ? <Action label={t("posterAction")} variant="default" onPress={() => dispatch({ type: "edit", phase: "poster" })} /> : null}
        <Action label={t("trimAction")} onPress={() => dispatch({ type: "edit", phase: "trim" })} />
      </> : null}
      {pending.phase === "trim" ? <>
        {(["start", "end"] as const).map((handle) => {
          const value = handle === "start" ? start : end;
          const adjust = (seconds: number) => dispatch({ type: "trim", handle, seconds });
          return <View key={handle} className="gap-2 rounded-lg bg-secondary p-3">
            <Button variant="outline" role={undefined} accessibilityRole="adjustable"
              accessibilityLabel={t(handle)} accessibilityValue={{ min: handle === "start" ? 0 : start + 1, max: handle === "start" ? end - 1 : pending.source.durationSeconds, now: value, text: `${value}s` }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "increment") adjust(value + 1);
                if (event.nativeEvent.actionName === "decrement") adjust(value - 1);
              }}>
              <Text>{t(handle)}: {value}s</Text>
            </Button>
            <View className="flex-row gap-2">
              <Action className="flex-1" label={t("decrease", { handle: t(handle) })} onPress={() => adjust(value - 1)} />
              <Action className="flex-1" label={t("increase", { handle: t(handle) })} onPress={() => adjust(value + 1)} />
            </View>
          </View>;
        })}
        <Action label={t("posterAction")} variant="default" disabled={error !== null} onPress={() => dispatch({ type: "edit", phase: "poster" })} />
      </> : null}
      {pending.phase === "poster" ? <>
        <View className="aspect-[4/3] justify-center rounded-lg bg-secondary p-4" accessibilityLabel={t("posterAt", { seconds: poster })}>
          <Frame atSeconds={poster} carX={poster} label={t("frame", { seconds: poster })} />
        </View>
        <Action label={t("posterEarlier")} onPress={() => dispatch({ type: "poster", seconds: poster - 1 })} />
        <Action label={t("posterLater")} onPress={() => dispatch({ type: "poster", seconds: poster + 1 })} />
        <Action label={t("editTrim")} onPress={() => dispatch({ type: "edit", phase: "trim" })} />
        <Action label={t("use")} variant="default" disabled={error !== null} onPress={() => dispatch({ type: "prepare" })} />
      </> : null}
      {pending.phase === "preparing" ? <>
        <Text variant="muted">{t("prepareHelp")}</Text>
        <Action label={t("finishPrepare")} disabled={preparingBusy} variant="default" onPress={() => { void prepare(); }} />
        <Action label={t("failPrepare")} disabled={preparingBusy} onPress={() => fail("preparing")} />
      </> : null}
      {pending.prepared ? <View className="gap-2">
        <Text testID="prepared-size">{t("prepared", { bytes: pending.prepared.sizeBytes })}</Text>
        <Text selectable variant="caption">{t("descriptor", { hash: pending.prepared.sha256 })}</Text>
      </View> : null}
      {["uploading", "paused"].includes(pending.phase) ? <>
        <Text>{t("progress", { percent: pending.progress })}</Text>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t("uploading")} accessibilityValue={{ min: 0, max: 100, now: pending.progress }} className="h-2 overflow-hidden rounded-full bg-secondary">
          <View className="h-full bg-foreground" style={{ width: `${pending.progress}%` }} />
        </View>
      </> : null}
      {pending.phase === "uploading" ? <>
        <Action label={t("upload")} variant="default" disabled={pending.progress === 100} onPress={upload} />
        <Action label={t("pause")} onPress={() => dispatch({ type: "pause" })} />
        <Action label={t("failUpload")} onPress={() => fail("uploading")} />
        <Action label={t("process")} disabled={pending.progress !== 100} onPress={() => dispatch({ type: "process" })} />
      </> : null}
      {pending.phase === "paused" ? <>
        <Text variant="muted">{t("pausedHelp")}</Text>
        <Action label={t("resume")} variant="default" onPress={() => dispatch({ type: "resume" })} />
      </> : null}
      {pending.phase === "processing" ? <>
        <Action label={t("finish")} variant="default" onPress={finish} />
        <Action label={t("failProcess")} onPress={() => fail("processing")} />
      </> : null}
      {pending.phase === "failed" ? <>
        <Text accessibilityRole="alert" className="text-destructive">{t(`${pending.failure}Error`)}</Text>
        <Action label={t("retry")} variant="default" onPress={() => dispatch({ type: "retry" })} />
      </> : null}
      {canEdit ? <Action label={t("another")} onPress={() => dispatch({ type: "library", open: true })} /> : null}
      <Action label={t(editable || pending.phase === "failed" ? "remove" : "cancel")} variant="destructive" onPress={discardPending} />
      <Action label={t("continue")} onPress={() => dispatch({ type: "view", value: "photos" })} />
    </View>;
  }

  return <SafeScreen>
    <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
      <Text variant="caption">{t("dev")}</Text>
      <Text variant="h1">{t("title")}</Text>
      <Text variant="muted">{t("intro")}</Text>
      <View className="gap-2 rounded-xl bg-card p-4">
        <Text testID="video-state" accessibilityLiveRegion="polite" variant="label">{t("state", { state: t(phase) })}</Text>
        <Text>{t("photos", { count: state.photos.length })}</Text>
        <Text variant="muted">{t("fields", { value: t("description") })}</Text>
        <Text>{t("publishable")}</Text>
        {state.active ? <View className="gap-2 border-t border-border pt-3">
          <Text testID="active-status">{t("active")}: {t("ready")}</Text>
          <Text variant="muted">{t("duration", {
            start: state.active.selection.startSeconds, end: state.active.selection.endSeconds,
            duration: state.active.selection.endSeconds - state.active.selection.startSeconds,
          })}</Text>
          <Text variant="muted">{t("posterAt", { seconds: state.active.selection.posterSeconds })}</Text>
        </View> : null}
        {state.active && pending ? <Text>{t("replacement")}: {t(pending.phase)}</Text> : null}
      </View>
      {state.view === "photos" ? <View className="gap-3 rounded-xl bg-card p-4">
        <Text variant="h3">{t("review")}</Text>
        <Text testID="optional-status">{t(pending ? pending.phase === "failed" ? "failedOptional" : "pending" : state.active ? "readyOptional" : "noVideo")}</Text>
        {pending ? <Text>{t("state", { state: t(pending.phase) })}</Text> : null}
        <Action label={t("returnVideo")} onPress={() => dispatch({ type: "view", value: "video" })} />
      </View> : state.libraryOpen ? <View className="gap-3 rounded-xl bg-card p-4">
        <Text variant="h3">{t("library")}</Text>
        <Text accessibilityLiveRegion="polite">{t("scenario", { state: t(state.access === "permission-denied" ? "permission" : state.access) })}</Text>
        {state.access !== "eligible" ? <>
          <Text accessibilityRole="alert">{t(state.access === "ineligible" ? "ineligibleHelp" : "permissionHelp")}</Text>
          <Action label={t("restore")} onPress={() => dispatch({ type: "access", value: "eligible" })} />
        </> : null}
        {SYNTHETIC_CLIPS.map((source) => <Action key={source.id} label={t("choose", { seconds: source.durationSeconds })} disabled={state.access !== "eligible"} onPress={() => select(source)} />)}
        <Action label={t("setEligible")} onPress={() => dispatch({ type: "access", value: "eligible" })} />
        <Action label={t("setIneligible")} onPress={() => dispatch({ type: "access", value: "ineligible" })} />
        <Action label={t("setPermission")} onPress={() => dispatch({ type: "access", value: "permission-denied" })} />
        <Action label={t("closeLibrary")} onPress={() => dispatch({ type: "library", open: false })} />
      </View> : pending ? editor() : <View className="gap-3 rounded-xl bg-card p-4">
        <Text variant="h3">{t(state.active ? "ready" : "empty")}</Text>
        <Action label={t(state.active ? "replace" : "add")} variant="default" onPress={() => dispatch({ type: "library", open: true })} />
        <Action label={t("continue")} onPress={() => dispatch({ type: "view", value: "photos" })} />
      </View>}
      {pending ? <Text selectable variant="caption">{t("sourceHash", { hash: pending.source.sha256 })}</Text> : null}
      {state.active ? <Action label={t("removeActive")} variant="destructive" onPress={() => { if (state.active) adapter.discard(state.active.prepared); dispatch({ type: "remove-active" }); }} /> : null}
      <Action label={t("reset")} onPress={() => {
        discardPending();
        if (state.active) adapter.discard(state.active.prepared);
        dispatch({ type: "reset" });
      }} />
    </ScrollView>
  </SafeScreen>;
}
