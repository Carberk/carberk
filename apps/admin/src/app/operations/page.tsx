import { AdminNav } from "../(admin)/components/AdminNav";

import { OperationsWorkspace } from "./OperationsWorkspace";

import { currentMarketplaceAdmin, requireStaffCapability } from "@/lib/staff-session";

export default async function OperationsPage() {
  const summary = await requireStaffCapability("analytics.aggregate", "/operations"), marketplaceAdmin = await currentMarketplaceAdmin();
  return <><AdminNav capabilities={summary.capabilities} marketplaceAdmin={marketplaceAdmin}/><main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8"><OperationsWorkspace/></main></>;
}
