import { AdminNav } from "../(admin)/components/AdminNav";

import { DiagnosticWorkspace } from "./DiagnosticWorkspace";

import { currentMarketplaceAdmin, currentStaff } from "@/lib/staff-session";
export default async function DiagnosticsPage() {
 const summary = await currentStaff("/diagnostics"), marketplaceAdmin = await currentMarketplaceAdmin();
 return <><AdminNav capabilities={summary.capabilities} marketplaceAdmin={marketplaceAdmin}/><main id="main" className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8"><DiagnosticWorkspace/></main></>;
}
