import { marketplaceAssociations } from "@/lib/marketplace-links";
export const dynamic = "force-dynamic";
export async function GET() {
 const config = marketplaceAssociations().android;
 return config ? Response.json(config, { headers: { "Cache-Control": "public, max-age=300" } }) : new Response(null, { status: 404 });
}
