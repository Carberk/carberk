import { Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";

import { Photo as Image } from "../../media/photoRoute";

import { Icon } from "@/components/ui/icon";

interface ImagePreviewModalProps {
  uri: string | null;
  onClose: () => void;
}

export function ImagePreviewModal({ uri, onClose }: ImagePreviewModalProps) {
  const { t } = useTranslation();
  const visible = !!uri;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/90 justify-center items-center">
        <Pressable
          onPress={onClose}
          className="absolute top-12 right-4 z-10 h-11 w-11 rounded-full bg-black/50 items-center justify-center"
          accessibilityLabel={t("close")}
        >
          <Icon as={X} className="size-6 text-white" />
        </Pressable>

        {uri && (
          <Image
            source={{ uri }}
            className="w-full h-[70%]"
            contentFit="contain"
          />
        )}
      </View>
    </Modal>
  );
}
