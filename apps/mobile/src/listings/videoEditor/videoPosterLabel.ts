export function videoPosterLabel(durationMs: number | undefined, language: string) {
 const seconds = Math.max(1, Math.ceil((durationMs ?? 0) / 1000));
 return language === "ru" ? `Смотреть видео, ${seconds} секунд` : language === "tk" ? `Wideony gör, ${seconds} sekunt` : `Play video, ${seconds} seconds`;
}
