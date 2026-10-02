import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, Flag, ImageOff, RotateCcw, Trash2 } from "lucide-react-native";
import { Image } from "expo-image";
import type { ConversationsSchemas } from "@auto-tm/contracts";

import { buildChatImageUrl } from "../upload/buildChatImageUrl";
import { formatMessageTime } from "../messageTime";

import { PostRefCard } from "./PostRefCard";

import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

export type MessageStatus = "pending" | "failed" | "sent" | "delivered" | "read";

export interface ImageMessageMetadata {
  key: string;
  width?: number;
  height?: number;
}

export type PostRefMessageMetadata = ConversationsSchemas.PostRefMessageMetadata;

interface MessageBubbleProps {
  id: string;
  text: string;
  kind?: "text" | "image" | "post_ref";
  metadata?: ImageMessageMetadata | PostRefMessageMetadata;
  localImageUri?: string;
  isMine: boolean;
  status: MessageStatus;
  createdAt: string;
  deletedAt?: string | null;
  canDelete?: boolean;
  canReport?: boolean;
  reported?: boolean;
  /** The "Read" label under the bubble; only the last own Message carries it (D6). */
  showReadLabel?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onImagePress?: () => void;
  postRefBrandName?: string;
  postRefModelName?: string;
  onPostRefPress?: (listingId: string) => void;
}

const BUBBLE_MAX_WIDTH = 256;
const DEFAULT_IMAGE_HEIGHT = 192;

const TICK_CLASS = "size-3.5 text-primary-foreground/80";

/** ✓ sent, ✓✓ delivered or read, in one style (D6); read adds the label under the bubble. */
function StatusTick({ status }: { status: MessageStatus }) {
  if (status === "sent") {
    return (
      <View testID="message-tick-sent">
        <Icon as={Check} className={TICK_CLASS} />
      </View>
    );
  }
  if (status === "delivered" || status === "read") {
    return (
      <View testID="message-tick-double">
        <Icon as={CheckCheck} className={TICK_CLASS} />
      </View>
    );
  }
  return null;
}

function ImageBubble({
  uri,
  width,
  height,
  onPress,
}: {
  uri: string;
  width?: number;
  height?: number;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  const displayHeight =
    width && height && width > 0
      ? Math.min(DEFAULT_IMAGE_HEIGHT, Math.round((height / width) * BUBBLE_MAX_WIDTH))
      : DEFAULT_IMAGE_HEIGHT;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "imagebutton" : "image"}
      accessibilityLabel={t("photo")}
      className="overflow-hidden rounded-xl"
    >
      {failed ? (
        <View
          className="items-center justify-center bg-muted"
          style={{ width: BUBBLE_MAX_WIDTH, height: DEFAULT_IMAGE_HEIGHT }}
        >
          <Icon as={ImageOff} className="size-6 text-muted-foreground" />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={{ width: BUBBLE_MAX_WIDTH, height: displayHeight }}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      )}
    </Pressable>
  );
}

interface BubbleContentProps {
  isDeleted: boolean;
  isImage: boolean;
  isPostRef: boolean;
  imageUri?: string;
  text: string;
  metadata?: ImageMessageMetadata | PostRefMessageMetadata;
  isMine: boolean;
  onImagePress?: () => void;
  postRefBrandName?: string;
  postRefModelName?: string;
  onPostRefPress?: (listingId: string) => void;
}

function isPostRefMetadata(
  metadata: ImageMessageMetadata | PostRefMessageMetadata | undefined,
): metadata is PostRefMessageMetadata {
  return metadata != null && "listingId" in metadata;
}

function BubbleContent({
  isDeleted,
  isImage,
  isPostRef,
  imageUri,
  text,
  metadata,
  isMine,
  onImagePress,
  postRefBrandName,
  postRefModelName,
  onPostRefPress,
}: BubbleContentProps) {
  const { t } = useTranslation();

  if (isDeleted) {
    return (
      <View className="flex-row items-center gap-1.5">
        <Icon as={Trash2} className="size-4 text-muted-foreground" />
        <Text className="text-sm italic text-muted-foreground">
          {t("conversations:messageDeleted")}
        </Text>
      </View>
    );
  }

  if (isImage && imageUri) {
    const imageMeta =
      metadata && "key" in metadata ? metadata : undefined;
    return (
      <ImageBubble
        uri={imageUri}
        width={imageMeta?.width}
        height={imageMeta?.height}
        onPress={onImagePress}
      />
    );
  }

  if (isPostRef && isPostRefMetadata(metadata)) {
    return (
      <PostRefCard
        listingId={metadata.listingId}
        brandId={metadata.brandId}
        modelId={metadata.modelId}
        year={metadata.year}
        displayPriceTmt={metadata.displayPriceTmt}
        priceCurrency={metadata.priceCurrency}
        coverMediaKey={metadata.coverMediaKey}
        status={metadata.status}
        available={metadata.available}
        brandName={postRefBrandName}
        modelName={postRefModelName}
        onPress={onPostRefPress}
      />
    );
  }

  return (
    <Text
      className={`text-base leading-5 ${
        isMine ? "text-primary-foreground" : "text-foreground"
      }`}
    >
      {text}
    </Text>
  );
}

const STATUS_LABEL_KEYS: Record<MessageStatus, string> = {
  pending: "sending",
  failed: "failedToSend",
  sent: "conversations:messageSent",
  delivered: "conversations:messageDelivered",
  read: "conversations:messageRead",
};

export function MessageBubble({
  text,
  isMine,
  status,
  createdAt,
  kind = "text",
  metadata,
  localImageUri,
  deletedAt,
  canDelete,
  canReport,
  reported,
  showReadLabel = false,
  onRetry,
  onDelete,
  onReport,
  onImagePress,
  postRefBrandName,
  postRefModelName,
  onPostRefPress,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation();
  const isDeleted = !!deletedAt;
  const isImage = kind === "image" && !isDeleted;
  const isPostRef = kind === "post_ref" && !isDeleted;
  const isReported = !!reported;
  const isPending = status === "pending" && !isDeleted;
  const isFailed = status === "failed" && !isDeleted;
  const imageUri =
    localImageUri ??
    (metadata && "key" in metadata && metadata.key
      ? buildChatImageUrl(metadata.key)
      : undefined);
  const time = formatMessageTime(createdAt, i18n.language);

  let longPressAction: (() => void) | undefined;
  if (!isDeleted && !isReported) {
    if (canDelete) {
      longPressAction = onDelete;
    } else if (canReport) {
      longPressAction = onReport;
    }
  }

  const content = isDeleted
    ? t("conversations:messageDeleted")
    : isImage
      ? t("photo")
      : isPostRef
        ? t("listing")
        : text;
  const stateLabel = isMine && !isDeleted ? t(STATUS_LABEL_KEYS[status]) : undefined;
  const reportedLabel = isReported && !isDeleted ? t("reported") : undefined;
  const accessibilityLabel = [content, time, stateLabel, reportedLabel]
    .filter(Boolean)
    .join(", ");
  // Image and Listing bubbles hold their own pressable content, which a grouped
  // accessible element would hide from screen readers. Their footer row reads
  // the time and state instead.
  const groupForAccessibility = !isImage && !isPostRef;
  const footerLabel = groupForAccessibility
    ? undefined
    : [time, stateLabel].filter(Boolean).join(", ");

  const metaColorClass =
    isMine && !isDeleted ? "text-primary-foreground/80" : "text-muted-foreground";

  return (
    <View className={`px-4 py-1 ${isMine ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isDeleted
            ? "bg-muted/60 rounded-md"
            : isMine
              ? "bg-primary rounded-br-md"
              : "bg-muted rounded-bl-md"
        } ${isPending ? "opacity-70" : ""}`}
      >
        <Pressable
          onLongPress={longPressAction}
          accessible={groupForAccessibility}
          accessibilityLabel={groupForAccessibility ? accessibilityLabel : undefined}
        >
          <BubbleContent
            isDeleted={isDeleted}
            isImage={isImage}
            isPostRef={isPostRef}
            imageUri={imageUri}
            text={text}
            metadata={metadata}
            isMine={isMine}
            onImagePress={onImagePress}
            postRefBrandName={postRefBrandName}
            postRefModelName={postRefModelName}
            onPostRefPress={onPostRefPress}
          />

          {isPending ? (
            <View className="flex-row items-center justify-end mt-1">
              <Text className={`text-xs ${metaColorClass}`}>{t("sending")}</Text>
            </View>
          ) : !isFailed ? (
            <View
              accessible={!groupForAccessibility}
              accessibilityLabel={footerLabel}
              className={`flex-row items-center gap-1 mt-1 ${
                isMine ? "justify-end" : "justify-start"
              }`}
            >
              <Text className={`text-xs ${metaColorClass}`}>{time}</Text>
              {isMine && !isDeleted && <StatusTick status={status} />}
            </View>
          ) : null}

          {isReported && !isDeleted && (
            <View
              className={`flex-row items-center gap-1 mt-1 ${
                isMine ? "justify-end" : "justify-start"
              }`}
            >
              <Icon as={Flag} className={`size-3.5 ${metaColorClass}`} />
              <Text className={`text-xs ${metaColorClass}`}>{t("reported")}</Text>
            </View>
          )}
        </Pressable>

        {isFailed && (
          <View className="flex-row items-center justify-end gap-1 mt-1">
            <Text
              className={`text-xs ${isMine ? "text-primary-foreground" : "text-destructive"}`}
            >
              {t("failedToSend")}
            </Text>
            {onRetry && (
              <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={t("retry")}
                style={{ minHeight: 44, minWidth: 44 }}
                className="flex-row items-center justify-center gap-1 -my-3 px-1"
              >
                <Icon
                  as={RotateCcw}
                  className={`size-3.5 ${isMine ? "text-primary-foreground" : "text-destructive"}`}
                />
                <Text
                  className={`text-xs font-semibold underline ${
                    isMine ? "text-primary-foreground" : "text-destructive"
                  }`}
                >
                  {t("retry")}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {showReadLabel && (
        <Text className="mx-1 mt-0.5 text-xs text-muted-foreground">
          {t("conversations:messageRead")}
        </Text>
      )}
    </View>
  );
}
