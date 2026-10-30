import { AdminNav } from "../(admin)/components/AdminNav";

import { BusinessAdmissionPanel } from "./BusinessAdmissionForm";


import { currentStaff, currentMarketplaceAdmin } from "@/lib/staff-session";

export default async function BusinessAdmissionPage() {
  const summary = await currentStaff("/business-admission");
  const marketplaceAdmin = await currentMarketplaceAdmin();
  const canAdmit = summary.capabilities.includes("founder.admission");
  const canRecover = summary.capabilities.includes("founder.recovery");
  return <><AdminNav capabilities={summary.capabilities} marketplaceAdmin={marketplaceAdmin}/><main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8 text-neutral-950"><BusinessAdmissionPanel canAdmit={canAdmit} canRecover={canRecover}/></main></>;
}
