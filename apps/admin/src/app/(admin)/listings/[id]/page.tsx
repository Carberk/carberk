import Link from "next/link";

import { ListingVideo } from "../../components/ListingVideo";
import { getListingVideo, getConfig } from "../../actions";
import { DirectActionForm } from "../../components/DirectActionForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingActionPage({ params }: PageProps) {
  const { id } = await params;
  const [configResult, videoResult] = await Promise.all([getConfig(), getListingVideo(id)]);
  const moderationEnabled = configResult.ok
    ? configResult.data.adminModerationActionsEnabled
    : true;

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/reports" className="text-brand-600 hover:underline text-sm">
          ← Назад к очереди
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">Действия с объявлением</h1>
      <p className="text-sm text-neutral-500 mb-6">ID: {id}</p>

      <ListingVideo key={id} listingId={id} result={videoResult} />

      {moderationEnabled ? (
        <div className="space-y-6">
          <div className="rounded-md border bg-surface p-4">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Заблокировать объявление
            </h2>
            <p className="text-xs text-neutral-500 mb-3">
              Объявление будет скрыто из публичного доступа. Новые сообщения и контакты будут заблокированы. Существующие переписки останутся доступными.
            </p>
            <DirectActionForm
              actionType="ban"
              targetId={id}
            />
          </div>

          <div className="rounded-md border bg-surface p-4">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Разблокировать объявление
            </h2>
            <p className="text-xs text-neutral-500 mb-3">
              Объявление будет восстановлено в статус active. Жалобы автоматически не закрываются.
            </p>
            <DirectActionForm
              actionType="unban"
              targetId={id}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-surface p-4">
          <p className="text-sm text-neutral-500">
            Действия модерации временно недоступны.
          </p>
        </div>
      )}
    </div>
  );
}
