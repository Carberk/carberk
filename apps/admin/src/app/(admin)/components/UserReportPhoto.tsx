"use client";

import { useEffect, useState } from "react";
import { IdentitySchemas } from "@auto-tm/contracts";

import { useAdminTranslation, AdminText } from "@/lib/i18n";

const { AVATAR_COUNT } = IdentitySchemas;

interface UserReportPhotoProps {
  hasPhoto: boolean;
  photoUrl: string | undefined;
  avatarIndex: number | undefined;
}

export function UserReportPhoto({ hasPhoto, photoUrl, avatarIndex }: UserReportPhotoProps) {
  const t=useAdminTranslation();
  const [hadPhoto, setHadPhoto] = useState(hasPhoto);
  useEffect(() => {
    if (hasPhoto) setHadPhoto(true);
  }, [hasPhoto]);

  if (hasPhoto) {
    return photoUrl ? (
      <img src={photoUrl} alt={t("Фото профиля")} className="h-32 w-32 rounded-full object-cover" />
    ) : (
      <p className="text-neutral-500"><AdminText>Фото профиля недоступно.</AdminText></p>
    );
  }

  // Show the restored mark only after a photo disappears during this report visit.
  if (hadPhoto && avatarIndex !== undefined) {
    return <img src={`/assigned-avatars/${avatarIndex % AVATAR_COUNT}.svg`} alt={t("Назначенный аватар")} className="h-32 w-32 rounded-full" />;
  }
  return null;
}
