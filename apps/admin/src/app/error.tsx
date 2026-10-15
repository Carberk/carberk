"use client";

export default function ErrorPage({ unstable_retry }: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry: () => void;
}) {
  return (
    <main className="p-8" role="alert">
      <h1><AdminText>Временно недоступно. Попробуйте ещё раз.</AdminText></h1>
      <button type="button" onClick={unstable_retry}><AdminText>Попробовать ещё раз</AdminText></button>
    </main>
  );
}import { AdminText } from "@/lib/i18n";

