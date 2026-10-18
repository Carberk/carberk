import { sharingEnabled } from "@/lib/marketplace-links";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ enabled: sharingEnabled() }, { headers: { "Cache-Control": "no-store" } }); }
