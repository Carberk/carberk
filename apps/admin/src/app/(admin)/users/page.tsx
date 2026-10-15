import { AdminContextDirectory } from "../components/AdminContextViews";

import { adminDirectoryQuery, readAdminContext, AdminContextSchemas } from "@/lib/admin-context";
import { AdminText } from "@/lib/i18n";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = adminDirectoryQuery(await searchParams, false);
  if (!AdminContextSchemas.AdminContextQuerySchema.safeParse(query).success) return <p role="alert" className="p-6"><AdminText>Проверьте параметры поиска.</AdminText></p>;
  const result = await readAdminContext(`users?${new URLSearchParams(query)}`, AdminContextSchemas.AdminContextUserPageSchema);
  if (!result.ok) return <p role="alert" className="p-6"><AdminText>{result.error}</AdminText></p>;
  return <AdminContextDirectory kind="users" query={query} result={result.data}/>;
}
