import Link from "next/link";

import { getConfig } from "../../actions";
import { DirectActionForm } from "../../components/DirectActionForm";

import { AdminText } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UserActionPage({ params }: PageProps) {
  const { id } = await params;
  const configResult = await getConfig();
  const moderationEnabled = configResult.ok
    ? configResult.data.adminModerationActionsEnabled
    : true;

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/reports" className="text-brand-600 hover:underline text-sm"><AdminText>← Назад к очереди</AdminText></Link>
      </div>

      <h1 className="text-2xl font-bold mb-2"><AdminText>Действия с пользователем</AdminText></h1>
      <p className="text-sm text-neutral-500 mb-6">ID: {id}</p>

      {moderationEnabled ? (
        <div className="space-y-6">
          <div className="rounded-md border bg-surface p-4">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3"><AdminText>Заблокировать пользователя</AdminText></h2>
            <p className="text-xs text-neutral-500 mb-3"><AdminText>Пользователь не сможет создавать объявления, отправлять сообщения или совершать другие действия. Существующие переписки останутся доступными.</AdminText></p>
            <DirectActionForm
              actionType="suspend"
              targetId={id}
            />
          </div>

          <div className="rounded-md border bg-surface p-4">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3"><AdminText>Разблокировать пользователя</AdminText></h2>
            <p className="text-xs text-neutral-500 mb-3"><AdminText>Пользователь будет восстановлен. История блокировки сохранится в аудите.</AdminText></p>
            <DirectActionForm
              actionType="unsuspend"
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
