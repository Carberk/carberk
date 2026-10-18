import { AdminNav } from "../(admin)/components/AdminNav";

import { ImprovementWorkspace } from "./ImprovementWorkspace";

import { currentMarketplaceAdmin,currentStaff } from "@/lib/staff-session";
export default async function ImprovementPage() {
 const summary=await currentStaff("/improvement"),marketplaceAdmin=await currentMarketplaceAdmin();
 return <><AdminNav capabilities={summary.capabilities} marketplaceAdmin={marketplaceAdmin}/><main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8"><ImprovementWorkspace canInvestigate={summary.capabilities.includes("analytics.investigate")}/></main></>;
}
