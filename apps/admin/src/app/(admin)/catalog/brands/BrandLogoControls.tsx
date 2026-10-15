"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@auto-tm/ui/components";
import { AlertCircle, Loader2 } from "lucide-react";

import { removeBrandLogo, uploadBrandLogo } from "./actions";

import { useAdminLocale, AdminText } from "@/lib/i18n";

interface BrandLogoControlsProps {
  brandId: string;
  brandName: string;
  hasLogo: boolean;
}

export function BrandLogoControls({ brandId, brandName, hasLogo }: BrandLogoControlsProps) {
  const {locale}=useAdminLocale();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.set("logo", file);
    startTransition(async () => {
      const result = await uploadBrandLogo(brandId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeBrandLogo(brandId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
        <input
          ref={inputRef}
          type="file"
          accept="image/svg+xml,image/png,image/webp"
          className="hidden"
          onChange={onFileChosen}
          aria-label={locale==="tk"?`${brandName} üçin logotip faýly`:locale==="en"?`Logo file for ${brandName}`:`Файл логотипа для ${brandName}`}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
        >
          <AdminText>{hasLogo ? "Заменить" : "Загрузить"}</AdminText>
        </Button>
        {hasLogo && (
          <Button type="button" variant="destructive" disabled={isPending} onClick={onRemove}><AdminText>Удалить</AdminText></Button>
        )}
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <AdminText>{error}</AdminText>
        </div>
      )}
    </div>
  );
}
