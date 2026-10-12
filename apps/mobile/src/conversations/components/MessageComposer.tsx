import { useState, useCallback, useEffect } from "react";
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "nativewind";
import { Send, Paperclip, X, AlertCircle } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { Image } from "expo-image";

import { THEME } from "../../../lib/theme";
import {
  compressChatImage,
  getChatImageStagingPath,
  ensureChatStagingDir,
  ChatImageUploadError,
} from "../upload/chatImageUpload";

import { QuickReplies } from "./QuickReplies";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const MAX_CHARS = 1000;

export interface ComposerAttachment {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
}

interface MessageComposerProps {
  onSend: (text: string) => void;
  onSendImage?: (attachment: ComposerAttachment) => void;
  disabled?: boolean;
  showQuickReplies?: boolean;
  onTyping?: () => void;
  onStopTyping?: () => void;
  conversationId?: string;
  /** Text typed in when the composer first appears (Ask the seller); the buyer still presses Send. */
  initialText?: string;
}

export function MessageComposer({
  onSend,
  onSendImage,
  disabled = false,
  showQuickReplies = false,
  onTyping,
  onStopTyping,
  conversationId,
  initialText = "",
}: MessageComposerProps) {
  const [text, setText] = useState(initialText);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionError, setCompressionError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mediaPermission, requestMediaPermission] =
    ImagePicker.useMediaLibraryPermissions();
  const { t } = useTranslation();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? "light";
  const placeholderColor = `hsl(${THEME[scheme].mutedForeground})`;

  useEffect(() => {
    if (mediaPermission?.granted) {
      setPermissionDenied(false);
    }
  }, [mediaPermission?.granted]);

  const trimmed = text.trim();
  const isOverLimit = text.length > MAX_CHARS;
  const canSendText = trimmed.length > 0 && !isOverLimit && !disabled;
  const canSendImage = !!attachment && !disabled;
  const canSend = canSendText || canSendImage;

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    if (value.trim().length > 0) {
      onTyping?.();
    } else {
      onStopTyping?.();
    }
  }, [onTyping, onStopTyping]);

  const handleRemoveAttachment = useCallback(() => {
    if (attachment?.uri) {
      FileSystem.deleteAsync(attachment.uri, { idempotent: true }).catch(
        () => {},
      );
    }
    setAttachment(null);
    setCompressionError(null);
  }, [attachment?.uri]);

  const handlePickImage = useCallback(async () => {
    if (disabled || isCompressing || !conversationId) return;

    setCompressionError(null);
    setPermissionDenied(false);

    try {
      if (mediaPermission && !mediaPermission.granted && mediaPermission.canAskAgain) {
        const response = await requestMediaPermission();
        if (!response.granted) {
          setPermissionDenied(true);
          return;
        }
      } else if (mediaPermission && !mediaPermission.granted && !mediaPermission.canAskAgain) {
        setPermissionDenied(true);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      const sourceUri = asset.uri;

      setIsCompressing(true);
      await ensureChatStagingDir(conversationId);
      const tempClientId = `picker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const destinationUri = getChatImageStagingPath(conversationId, tempClientId);
      const compressed = await compressChatImage(sourceUri, destinationUri);
      setAttachment(compressed);
    } catch (err) {
      const error = err instanceof ChatImageUploadError ? err : new ChatImageUploadError(
        err instanceof Error ? err.message : t("uploadErrorUnknown"),
        "compression_failed",
        true,
      );
      setCompressionError(error.message);
    } finally {
      setIsCompressing(false);
    }
  }, [
    disabled,
    isCompressing,
    conversationId,
    mediaPermission,
    requestMediaPermission,
    t,
  ]);

  const handleSend = useCallback(() => {
    if (!canSend) return;

    if (attachment && onSendImage) {
      onSendImage(attachment);
      setAttachment(null);
      setCompressionError(null);
    } else if (canSendText) {
      onSend(trimmed);
      setText("");
    }

    onStopTyping?.();
  }, [canSend, attachment, onSendImage, canSendText, onSend, trimmed, onStopTyping]);

  const handleBlur = useCallback(() => {
    onStopTyping?.();
  }, [onStopTyping]);

  return (
    // The Conversation screen owns keyboard avoidance for its whole column (#843).
    <View>
      {showQuickReplies && (
        <QuickReplies onSelect={setText} disabled={disabled} />
      )}

      {attachment && (
        <View className="px-4 pt-2 pb-1 bg-background">
          <View className="relative h-24 w-24 self-start">
            <View className="h-full w-full overflow-hidden rounded-xl border border-border bg-muted">
              <Image
                source={{ uri: attachment.uri }}
                className="h-24 w-24"
                contentFit="cover"
              />
            </View>
            <Pressable
              onPress={handleRemoveAttachment}
              accessibilityRole="button"
              accessibilityLabel={t("remove")}
              className="absolute right-0 top-0 h-11 w-11 items-end justify-start"
            >
              <View className="h-6 w-6 items-center justify-center rounded-full border border-border bg-muted">
                <Icon as={X} className="size-3.5 text-foreground" />
              </View>
            </Pressable>
          </View>
        </View>
      )}

      {compressionError && (
        <View className="px-4 pt-1 pb-1 bg-background">
          <Text className="text-caption text-destructive">{compressionError}</Text>
        </View>
      )}

      {permissionDenied && (
        <View className="px-4 py-2 bg-background border-t border-border">
          <View className="flex-row items-center gap-2">
            <Icon as={AlertCircle} className="size-4 text-destructive shrink-0" />
            <Text className="text-caption text-muted-foreground flex-1">
              {t("photoPermissionDenied")}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => void Linking.openSettings()}
              accessibilityLabel={t("openSettings")}
            >
              <Text>{t("openSettings")}</Text>
            </Button>
          </View>
        </View>
      )}

      <View className="flex-row items-end gap-2 px-4 py-3 border-t border-border bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          disabled={disabled || isCompressing || !conversationId}
          onPress={handlePickImage}
          accessibilityLabel={t("attachImage", { ns: "conversations" })}
        >
          {isCompressing ? (
            <ActivityIndicator size="small" className="text-foreground" />
          ) : (
            <Icon as={Paperclip} className="size-5 text-foreground" />
          )}
        </Button>

        {/* One line: 22 dp of text and 20 dp of padding, held at the buttons' 44 dp with the text
            centred, so the row shares one centre. More lines: the field grows and `items-end`
            keeps both buttons at its bottom. The input's own vertical padding is zeroed because
            the native default differs by platform and made the one-line field taller than 44 dp. */}
        <View className="flex-1 min-h-11 justify-center rounded-2xl bg-muted px-4 py-2.5">
          <TextInput
            className="text-body text-foreground max-h-[120px] py-0"
            style={{ textAlignVertical: "center" }}
            placeholder={t("messageComposerPlaceholder")}
            placeholderTextColor={placeholderColor}
            value={text}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            multiline
            maxLength={MAX_CHARS}
            editable={!disabled}
            accessibilityLabel={t("sendMessage")}
            accessibilityHint={t("messageInputHint")}
          />
          {isOverLimit && (
            <View className="pt-1">
              <Text className="text-caption text-destructive">
                {t("messageTooLong", { max: MAX_CHARS })}
              </Text>
            </View>
          )}
        </View>
        <Button
          variant="brand"
          size="icon"
          className="rounded-full h-11 w-11"
          disabled={!canSend}
          onPress={handleSend}
          accessibilityLabel={t("sendMessage")}
        >
          <Icon
            as={Send}
            className={cn("size-5", canSend ? "text-primary-foreground" : "text-muted-foreground")}
          />
        </Button>
      </View>
    </View>
  );
}
