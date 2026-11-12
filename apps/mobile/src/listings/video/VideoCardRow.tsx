import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { AlertCircle, Video } from "lucide-react-native";

import { useVideoThumbnails } from "./useVideoThumbnails";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";


/** What sits in the row's 4:3 thumbnail: the Ready cover, a frame of the phone's clip, work in progress, or a problem. */
export type VideoThumb =
  | { kind: "cover"; uri?: string | undefined; durationMs: number }
  | { kind: "frame"; uri: string; atS: number }
  | { kind: "busy" }
  | { kind: "error" }
  | { kind: "empty" };

export interface VideoAction {
  label: string;
  onPress(): void;
  disabled?: boolean;
}

/**
 * One state of the Listing video card: a thumbnail, one status line and at
 * most one quiet detail line. Problems are marked by the thumbnail and read
 * out as an alert; the card stays calm instead of turning into a coloured box.
 */
export function VideoCardRow({ thumb, title, meta, alert = false, testID, children }: {
  thumb: VideoThumb;
  title: string;
  meta?: string | null | undefined;
  alert?: boolean;
  testID?: string;
  children?: ReactNode;
}) {
  return (
    <View className="gap-3" testID={testID}>
      <View className="flex-row items-center gap-3" accessibilityRole={alert ? "alert" : undefined}>
        <Thumb thumb={thumb} />
        <View className="flex-1 gap-0.5">
          <Text className="text-callout font-semibold" accessibilityLiveRegion="polite">{title}</Text>
          {meta ? <Text className="text-footnote text-muted-foreground">{meta}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * One tonal action and at most one quiet one. A pair shares the row in equal
 * halves, so a long label wraps inside its button instead of pushing the
 * second action onto its own line. A lone action is always the tonal button:
 * a quiet one on its own reads as stray text.
 */
export function VideoCardActions({ primary, secondary, alternatives }: {
  primary?: VideoAction | null;
  secondary?: VideoAction | null;
  alternatives?: VideoAction[] | undefined;
}) {
  const { t } = useTranslation();
  const [showOptions, setShowOptions] = useState(false);
  if (primary && alternatives?.length) {
    return <View className="flex-row gap-2">
      <ActionButton action={primary} variant="secondary" className="flex-1 shrink" />
      <Button variant="ghost" size="sm" className="min-h-11 flex-1 shrink" accessibilityLabel={t("listingVideoMore")} onPress={() => setShowOptions(true)} disabled={alternatives.every((action) => action.disabled)}>
        <Text>{t("listingVideoMore")}</Text>
      </Button>
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <View className="flex-1 items-center justify-center bg-scrim/50 p-6">
          <View className="w-full max-w-sm gap-3 rounded-3xl bg-popover p-6" accessibilityViewIsModal>
            <Text className="text-headline font-semibold" accessibilityRole="header">{t("listingVideoMore")}</Text>
            {alternatives.map((action) => <ActionButton key={action.label} action={{ ...action, onPress: () => { setShowOptions(false); action.onPress(); } }} variant="secondary" />)}
            <Button variant="ghost" className="min-h-11" onPress={() => setShowOptions(false)}><Text>{t("cancel")}</Text></Button>
          </View>
        </View>
      </Modal>
    </View>;
  }
  if (primary && secondary) {
    return (
      <View className="flex-row gap-2">
        <ActionButton action={primary} variant="secondary" className="flex-1 shrink" />
        <ActionButton action={secondary} variant="ghost" className="flex-1 shrink" />
      </View>
    );
  }
  const only = primary ?? secondary;
  return only ? <View className="flex-row"><ActionButton action={only} variant="secondary" /></View> : null;
}

function ActionButton({ action, variant, className }: { action: VideoAction; variant: "secondary" | "ghost"; className?: string }) {
  return (
    <Button variant={variant} size="sm" className={`min-h-11 ${className ?? ""}`} onPress={action.onPress} disabled={action.disabled} accessibilityLabel={action.label}>
      <Text>{action.label}</Text>
    </Button>
  );
}

/** A thin determinate bar for upload progress. */
export function VideoProgress({ percent, testID }: { percent: number; testID?: string }) {
  return (
    <View className="h-1.5 overflow-hidden rounded-full bg-secondary" testID={testID}>
      <View className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
    </View>
  );
}

function Thumb({ thumb }: { thumb: VideoThumb }) {
  return (
    <View className="h-12 w-16 items-center justify-center overflow-hidden rounded-md bg-secondary" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {thumb.kind === "cover" ? thumb.uri ? <Image testID="video-cover-image" source={{ uri: thumb.uri }} style={FILL} contentFit="cover" cachePolicy="memory" /> : <Icon as={Video} className="size-5 text-muted-foreground" /> : null}
      {thumb.kind === "frame" ? <Frame uri={thumb.uri} atS={thumb.atS} /> : null}
      {thumb.kind === "busy" ? <ActivityIndicator testID="listing-video-thumb-busy" /> : null}
      {thumb.kind === "error" ? <Icon as={AlertCircle} className="size-5 text-destructive" /> : null}
      {thumb.kind === "empty" ? <Icon as={Video} className="size-5 text-muted-foreground" /> : null}
    </View>
  );
}

/** The chosen cover frame of the clip still on the phone. */
function Frame({ uri, atS }: { uri: string; atS: number }) {
  const [frame] = useVideoThumbnails(uri, [atS]);
  return frame
    ? <Image testID="listing-video-thumb-frame" source={{ uri: frame }} style={FILL} contentFit="cover" />
    : <Icon as={Video} className="size-5 text-muted-foreground" />;
}

const FILL = { width: "100%", height: "100%" } as const;
