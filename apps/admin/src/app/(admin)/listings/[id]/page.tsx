import Link from "next/link";

import { getConfig } from "../../actions";
import { DirectActionForm } from "../../components/DirectActionForm";
import { AdminContextListingDetail } from "../../components/AdminContextViews";

import { readAdminContext, AdminContextSchemas } from "@/lib/admin-context";
import { AdminText } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingActionPage({ params }: PageProps) {
  const { id } = await params;
  const context = await readAdminContext(`listings/${encodeURIComponent(id)}`, AdminContextSchemas.AdminContextListingDetailSchema);
  if (!context.ok) return <div className="p-6 md:p-8"><p role="alert"><AdminText>{context.error}</AdminText></p></div>;
  const configResult = await getConfig();
  const moderationEnabled = configResult.ok
    ? configResult.data.adminModerationActionsEnabled
    : false;

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/reports" className="text-brand-600 hover:underline text-sm"><AdminText>← Назад к очереди</AdminText></Link>
      </div>

      <h1 className="text-2xl font-bold mb-2"><AdminText>Действия с объявлением</AdminText></h1>
      <p className="text-sm text-neutral-500 mb-6">ID: {id}</p>

      <AdminContextListingDetail listing={context.data}/>
      {moderationEnabled ? (
        <div className="space-y-6">
          <div className="rounded-md border bg-surface p-4">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3"><AdminText>Заблокировать объявление</AdminText></h2>
            <p className="text-xs text-neutral-500 mb-3"><AdminText>Объявление будет скрыто из публичного доступа. Новые сообщения и контакты будут заблокированы. Существующие переписки останутся доступными.</AdminText></p>
            <DirectActionForm
              actionType="ban"
              targetId={id}
            />
          </div>

          <div className="rounded-md border bg-surface p-4">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3"><AdminText>Разблокировать объявление</AdminText></h2>
            <p className="text-xs text-neutral-500 mb-3"><AdminText>Объявление будет восстановлено в статус active. Жалобы автоматически не закрываются.</AdminText></p>
            <DirectActionForm
              actionType="unban"
              targetId={id}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-surface p-4">
          <p className="text-sm text-neutral-500"><AdminText>Действия модерации временно недоступны.</AdminText></p>
        </div>
      )}
    </div>
  );
}
