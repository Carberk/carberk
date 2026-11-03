import { useMemo, useReducer } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";

import {
  MAX_VIDEO_DURATION_SECONDS,
  createInitialVideoPrototypeState,
  selectedDurationSeconds,
  videoPrototypeReducer,
  type PrototypePhase,
  type VideoPrototypeAction,
  type VideoPrototypeState,
} from "./state";
import { createDeterministicLocalVideoAdapter } from "./localAdapter";

import { SafeScreen } from "@/components/navigation/SafeScreen";

const phaseLabels: Record<PrototypePhase, string> = {
  empty: "Empty slot",
  selection: "Library selection",
  preview: "Preview",
  trim: "Trim",
  poster: "Poster",
  preparing: "Preparing",
  uploading: "Uploading",
  paused: "Paused",
  processing: "Processing",
  failed: "Failed",
  ready: "Ready",
  "optional-video-pending": "Optional video pending",
};

function seconds(value: number): string {
  return `${value}s`;
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  tone = "secondary",
  ...props
}: PressableProps & {
  label: string;
  tone?: "primary" | "secondary" | "danger";
}) {
  const isDisabled = disabled === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.primaryButton : null,
        tone === "danger" ? styles.dangerButton : null,
        isDisabled ? styles.disabledButton : null,
        pressed && !isDisabled ? styles.pressedButton : null,
      ]}
      {...props}
    >
      <Text style={[styles.buttonText, tone === "primary" ? styles.primaryButtonText : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StateBadge({ phase }: { phase: PrototypePhase }) {
  return (
    <View style={styles.stateBadge} accessibilityRole="text">
      <View style={styles.stateDot} />
      <Text style={styles.stateBadgeText}>{phaseLabels[phase]}</Text>
    </View>
  );
}

function TrimHandle({
  label,
  value,
  onAdjust,
}: {
  label: string;
  value: number;
  onAdjust: (deltaSeconds: number) => void;
}) {
  return (
    <View style={styles.handleCard}>
      <Text style={styles.handleLabel}>{label}</Text>
      <Text style={styles.handleValue}>{seconds(value)}</Text>
      <View style={styles.inlineActions}>
        <ActionButton label={`${label} -5 seconds`} onPress={() => onAdjust(-5)} />
        <ActionButton label={`${label} +5 seconds`} onPress={() => onAdjust(5)} />
      </View>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Upload progress"
      accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, { width: `${progress}%` }]} />
    </View>
  );
}

function VideoDetails({ state }: { state: VideoPrototypeState }) {
  const duration = selectedDurationSeconds(state);
  if (!state.source || !state.selection) return null;

  return (
    <View style={styles.detailsCard}>
      <Text style={styles.cardTitle}>Synthetic local clip</Text>
      <Text style={styles.cardLine}>Source: {state.source.id}</Text>
      <Text style={styles.cardLine}>Source duration: {seconds(state.source.durationSeconds)}</Text>
      <Text style={styles.cardLine} selectable>
        Source hash: {state.source.sha256}
      </Text>
      <Text style={styles.cardLine}>
        Selected: {seconds(state.selection.startSeconds)}–{seconds(state.selection.endSeconds)}
        {duration === null ? "" : ` (${seconds(duration)})`}
      </Text>
      <Text style={styles.cardLine}>Poster: {seconds(state.selection.posterSeconds)}</Text>
      {state.prepared ? (
        <Text style={styles.cardLine} selectable>
          Prepared upload: {state.prepared.sizeBytes.toLocaleString()} bytes · {state.prepared.sha256}
        </Text>
      ) : null}
      <Text style={styles.localOnly}>Original source is never an upload fallback.</Text>
    </View>
  );
}

export function VideoUploadPrototype() {
  const [state, dispatch] = useReducer(
    videoPrototypeReducer,
    undefined,
    createInitialVideoPrototypeState,
  );
  const adapter = useMemo(() => createDeterministicLocalVideoAdapter(), []);

  function send(action: VideoPrototypeAction) {
    dispatch(action);
  }

  function finishPreparing() {
    if (state.source && state.selection) {
      // The call proves the local adapter seam. The reducer stores the same
      // deterministic prepared metadata and never accepts the source itself.
      adapter.prepare(state.source, state.selection);
    }
    send({ type: "finish-preparing" });
  }

  function uploadChunk() {
    if (state.prepared) {
      adapter.uploadChunk(state.prepared, state.uploadProgress / 25 - 1);
    }
    send({ type: "upload-chunk" });
  }

  function renderPhase() {
    switch (state.phase) {
      case "empty":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.emptyIcon} accessibilityLabel="Empty video slot">
              +
            </Text>
            <Text style={styles.phaseTitle}>Add an optional walkaround video</Text>
            <Text style={styles.bodyText}>
              Photos stay required for publishing. This local reviewer flow never contacts a service.
            </Text>
            <ActionButton label="Add video from library" onPress={() => send({ type: "open-selection" })} tone="primary" />
          </View>
        );

      case "selection":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Choose a deterministic library sample</Text>
            <Text style={styles.bodyText}>
              These clips stand in for the phone library. The source hash is fixed for every run.
            </Text>
            <ActionButton label="Choose 45-second clip" onPress={() => send({ type: "select-clip", durationSeconds: 45 })} tone="primary" />
            <ActionButton label="Choose exact 90-second clip" onPress={() => send({ type: "select-clip", durationSeconds: 90 })} />
            <ActionButton label="Choose 120-second clip" onPress={() => send({ type: "select-clip", durationSeconds: 120 })} />
            <ActionButton label="Cancel selection" onPress={() => send({ type: "remove-video" })} />
          </View>
        );

      case "preview":
        return (
          <View style={styles.phaseContent}>
            <View style={styles.previewFrame} accessibilityLabel="Synthetic video preview">
              <Text style={styles.previewPlay}>▶</Text>
              <Text style={styles.previewText}>Preview frame · local only</Text>
            </View>
            <Text style={styles.phaseTitle}>Preview the selected source</Text>
            <Text style={styles.bodyText}>
              {state.source && state.source.durationSeconds > MAX_VIDEO_DURATION_SECONDS
                ? "This source is longer than 90 seconds. Trim an interval before preparing."
                : "The selected source fits the 90-second maximum; trimming is still available."}
            </Text>
            <ActionButton label="Trim video" onPress={() => send({ type: "open-trim" })} tone="primary" />
            <ActionButton label="Choose another video" onPress={() => send({ type: "open-selection" })} />
          </View>
        );

      case "trim": {
        const selection = state.selection;
        const duration = selectedDurationSeconds(state);
        if (!selection) return null;
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Trim the interval</Text>
            <Text style={styles.bodyText}>
              Both handles are accessible adjustable controls. The selected interval must be at most 90 seconds.
            </Text>
            <View style={styles.handleRow}>
              <TrimHandle
                label="Video start"
                value={selection.startSeconds}
                onAdjust={(deltaSeconds) => send({ type: "adjust-trim", handle: "start", deltaSeconds })}
              />
              <TrimHandle
                label="Video end"
                value={selection.endSeconds}
                onAdjust={(deltaSeconds) => send({ type: "adjust-trim", handle: "end", deltaSeconds })}
              />
            </View>
            <Text style={styles.selectionDuration} accessibilityRole="text">
              Selected duration: {duration === null ? "—" : seconds(duration)} / {MAX_VIDEO_DURATION_SECONDS}s maximum
            </Text>
            {state.validationMessage ? <Text style={styles.errorText}>{state.validationMessage}</Text> : null}
            <ActionButton
              label="Use first 90 seconds"
              onPress={() => send({ type: "set-trim", startSeconds: 0, endSeconds: MAX_VIDEO_DURATION_SECONDS })}
            />
            <ActionButton
              label="Continue to poster"
              onPress={() => send({ type: "continue-to-poster" })}
              disabled={duration === null || duration > MAX_VIDEO_DURATION_SECONDS}
              tone="primary"
            />
            <ActionButton label="Remove video" onPress={() => send({ type: "remove-video" })} tone="danger" />
          </View>
        );
      }

      case "poster":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Choose the poster frame</Text>
            <View style={styles.posterFrame} accessibilityLabel="Poster frame preview">
              <Text style={styles.posterText}>Poster at {seconds(state.selection?.posterSeconds ?? 0)}</Text>
            </View>
            <Text style={styles.bodyText}>The poster stays inside the selected interval.</Text>
            <View style={styles.inlineActions}>
              <ActionButton label="Poster -5 seconds" onPress={() => send({ type: "adjust-poster", deltaSeconds: -5 })} />
              <ActionButton label="Poster +5 seconds" onPress={() => send({ type: "adjust-poster", deltaSeconds: 5 })} />
            </View>
            <ActionButton label="Use video and prepare locally" onPress={() => send({ type: "begin-preparing" })} tone="primary" />
            <ActionButton label="Remove video" onPress={() => send({ type: "remove-video" })} tone="danger" />
          </View>
        );

      case "preparing":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Preparing</Text>
            <Text style={styles.bodyText}>
              The local adapter trims only the selected interval and creates prepared output. No original bytes leave the device.
            </Text>
            <ActionButton label="Finish local preparation" onPress={finishPreparing} tone="primary" />
            <ActionButton label="Simulate preparation failure" onPress={() => send({ type: "fail", message: "Synthetic preparation failed" })} tone="danger" />
            <ActionButton label="Cancel and remove staged output" onPress={() => send({ type: "remove-video" })} tone="danger" />
            <ActionButton label="Continue with photos" onPress={() => send({ type: "continue-with-photos" })} />
          </View>
        );

      case "uploading":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Uploading · {state.uploadProgress}%</Text>
            <Text style={styles.bodyText}>Foreground local simulation of prepared output upload.</Text>
            <ProgressBar progress={state.uploadProgress} />
            <Text style={styles.cardLine}>Prepared size: {state.prepared?.sizeBytes.toLocaleString()} bytes</Text>
            <ActionButton label="Upload next chunk" onPress={uploadChunk} disabled={state.uploadProgress >= 100} tone="primary" />
            <ActionButton label="Pause upload" onPress={() => send({ type: "pause-upload" })} disabled={state.uploadProgress >= 100} />
            <ActionButton label="Simulate upload failure" onPress={() => send({ type: "fail", message: "Synthetic upload interruption" })} tone="danger" />
            <ActionButton label="Cancel and remove staged output" onPress={() => send({ type: "remove-video" })} tone="danger" />
            <ActionButton label="Start processing" onPress={() => send({ type: "begin-processing" })} disabled={state.uploadProgress < 100} tone="primary" />
            <ActionButton label="Continue with photos" onPress={() => send({ type: "continue-with-photos" })} />
          </View>
        );

      case "paused":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Paused</Text>
            <Text style={styles.bodyText}>The prepared output and confirmed progress are retained locally.</Text>
            <Text style={styles.cardLine}>Confirmed progress: {state.uploadProgress}%</Text>
            <ActionButton label="Resume upload" onPress={() => send({ type: "resume-upload" })} tone="primary" />
            <ActionButton label="Cancel and remove staged output" onPress={() => send({ type: "remove-video" })} tone="danger" />
            <ActionButton label="Continue with photos" onPress={() => send({ type: "continue-with-photos" })} />
          </View>
        );

      case "processing":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Processing</Text>
            <Text style={styles.bodyText}>The prepared clip is being represented as a local processing job.</Text>
            <ActionButton label="Finish processing" onPress={() => send({ type: "finish-processing" })} tone="primary" />
            <ActionButton label="Simulate processing failure" onPress={() => send({ type: "fail", message: "Synthetic processing failed" })} tone="danger" />
            <ActionButton label="Cancel and remove staged output" onPress={() => send({ type: "remove-video" })} tone="danger" />
            <ActionButton label="Continue with photos" onPress={() => send({ type: "continue-with-photos" })} />
          </View>
        );

      case "failed":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Failed</Text>
            <Text style={styles.errorText}>{state.failureMessage}</Text>
            <Text style={styles.bodyText}>
              Retry keeps the trim interval and poster frame. Remove clears all staged video output.
            </Text>
            <ActionButton label="Retry" onPress={() => send({ type: "retry" })} tone="primary" />
            <ActionButton label="Remove video" onPress={() => send({ type: "remove-video" })} tone="danger" />
            <ActionButton label="Continue with photos" onPress={() => send({ type: "continue-with-photos" })} />
          </View>
        );

      case "ready":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Video ready</Text>
            <Text style={styles.bodyText}>The prepared clip is ready locally. Photos remain required and publishable.</Text>
            <ActionButton label="Continue with photos" onPress={() => send({ type: "continue-with-photos" })} />
            <ActionButton label="Remove video" onPress={() => send({ type: "remove-video" })} tone="danger" />
          </View>
        );

      case "optional-video-pending":
        return (
          <View style={styles.phaseContent}>
            <Text style={styles.phaseTitle}>Optional video pending</Text>
            <Text style={styles.bodyText}>
              Photos remain publishable while this optional video is pending. Resume keeps trim and poster choices.
            </Text>
            <ActionButton label="Resume video" onPress={() => send({ type: "resume-video" })} tone="primary" />
            <ActionButton label="Remove video and keep photos" onPress={() => send({ type: "remove-video" })} tone="danger" />
          </View>
        );
    }
  }

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>DEV / REVIEWER BUILD · LOCAL ONLY</Text>
        <Text style={styles.title} accessibilityRole="header">Listing video upload prototype</Text>
        <Text style={styles.subtitle}>Deep link: /video-upload-prototype</Text>
        <Text style={styles.subtitle}>Synthetic adapter · no API, storage, queue, or external provider</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.cardTitle} accessibilityLabel={`Video state: ${phaseLabels[state.phase]}`}>
              Video state
            </Text>
            <StateBadge phase={state.phase} />
          </View>
          <Text style={styles.cardLine}>Photos preserved: {state.photos.length} required photos</Text>
          <Text style={styles.cardLine}>Maximum selected duration: {MAX_VIDEO_DURATION_SECONDS}s</Text>
        </View>

        <VideoDetails state={state} />
        {state.validationMessage && state.phase !== "trim" ? <Text style={styles.errorText}>{state.validationMessage}</Text> : null}
        {renderPhase()}

        {state.phase !== "empty" ? <ActionButton label="Reset prototype" onPress={() => send({ type: "reset" })} /> : null}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  eyebrow: { color: "#8b1e3f", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  title: { color: "#17171a", fontSize: 28, fontWeight: "800", lineHeight: 34 },
  subtitle: { color: "#62636a", fontSize: 14, lineHeight: 20 },
  summaryCard: { backgroundColor: "#f3f4f6", borderRadius: 16, padding: 16, gap: 8 },
  summaryHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 },
  stateBadge: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 999, flexDirection: "row", gap: 7, paddingHorizontal: 10, paddingVertical: 6 },
  stateDot: { backgroundColor: "#8b1e3f", borderRadius: 5, height: 10, width: 10 },
  stateBadgeText: { color: "#34353a", fontSize: 13, fontWeight: "700" },
  cardTitle: { color: "#202126", fontSize: 16, fontWeight: "700" },
  cardLine: { color: "#4e4f55", fontSize: 14, lineHeight: 20 },
  localOnly: { color: "#8b1e3f", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  detailsCard: { borderColor: "#e3e4e8", borderRadius: 16, borderWidth: 1, gap: 6, padding: 16 },
  phaseContent: { backgroundColor: "#ffffff", borderColor: "#e3e4e8", borderRadius: 16, borderWidth: 1, gap: 12, padding: 16 },
  emptyIcon: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#f3f4f6", borderRadius: 16, color: "#8b1e3f", fontSize: 34, height: 64, lineHeight: 60, overflow: "hidden", textAlign: "center", width: 64 },
  phaseTitle: { color: "#202126", fontSize: 20, fontWeight: "700", lineHeight: 26 },
  bodyText: { color: "#55565d", fontSize: 15, lineHeight: 22 },
  button: { alignItems: "center", backgroundColor: "#f1f2f4", borderRadius: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10 },
  primaryButton: { backgroundColor: "#8b1e3f" },
  dangerButton: { backgroundColor: "#fff0f2", borderColor: "#d54159", borderWidth: 1 },
  disabledButton: { backgroundColor: "#e3e4e8" },
  pressedButton: { opacity: 0.75 },
  buttonText: { color: "#202126", fontSize: 15, fontWeight: "700", textAlign: "center" },
  primaryButtonText: { color: "#ffffff" },
  previewFrame: { alignItems: "center", backgroundColor: "#25262a", borderRadius: 12, height: 150, justifyContent: "center", gap: 6 },
  previewPlay: { color: "#ffffff", fontSize: 36 },
  previewText: { color: "#d7d8dc", fontSize: 13 },
  handleRow: { flexDirection: "row", gap: 10 },
  handleCard: { backgroundColor: "#f7f7f8", borderRadius: 12, flex: 1, gap: 5, padding: 10 },
  handleLabel: { color: "#5d5e64", fontSize: 13, fontWeight: "700" },
  handleValue: { color: "#202126", fontSize: 22, fontWeight: "800" },
  inlineActions: { flexDirection: "row", gap: 8 },
  selectionDuration: { color: "#202126", fontSize: 15, fontWeight: "700" },
  errorText: { color: "#b4233a", fontSize: 15, fontWeight: "700", lineHeight: 21 },
  posterFrame: { alignItems: "center", backgroundColor: "#dfe3e9", borderRadius: 12, height: 150, justifyContent: "center" },
  posterText: { color: "#34353a", fontSize: 16, fontWeight: "700" },
  progressTrack: { backgroundColor: "#e3e4e8", borderRadius: 8, height: 14, overflow: "hidden", width: "100%" },
  progressFill: { backgroundColor: "#8b1e3f", height: "100%" },
});
