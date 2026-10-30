import { AdminContextDirectory } from "../components/AdminContextViews";

import { adminDirectoryQuery, readAdminContext, AdminContextSchemas } from "@/lib/admin-context";
import { AdminText } from "@/lib/i18n";

export default async function ListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = adminDirectoryQuery(await searchParams, true);
  const parsed = AdminContextSchemas.AdminContextListingQuerySchema.safeParse(query);
  if (!parsed.success) return <p role="alert" className="p-6"><AdminText>Проверьте параметры поиска.</AdminText></p>;
  const result = await readAdminContext(`listings?${new URLSearchParams(query)}`, AdminContextSchemas.AdminContextListingPageSchema);
  if (!result.ok) return <p role="alert" className="p-6"><AdminText>{result.error}</AdminText></p>;
  return <AdminContextDirectory kind="listings" query={query} result={result.data}/>;
}
