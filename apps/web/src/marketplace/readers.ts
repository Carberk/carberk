import { PublicMarketplaceSchemas } from "@auto-tm/contracts";

/** Do not reuse stale first-party metadata after lifecycle or business state changes. */
async function read<T>(path: string, schema: { parse(value: unknown): T }): Promise<T | null> {
 const origin = process.env["API_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_URL"];
 if (!origin) throw new Error("Public reader API origin is not configured");
 const response = await fetch(`${origin.replace(/\/$/, "")}/api/v1/public-marketplace${path}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
 if (response.status === 404 || response.status === 400) return null;
 if (!response.ok) throw new Error("Public reader request failed");
 return schema.parse(await response.json());
}
export const readPublicListing = (id: string) => read(`/listings/${encodeURIComponent(id)}`, PublicMarketplaceSchemas.PublicListingSchema);
export const readPublicShowroom = (id: string, cursor?: string) => read(`/showrooms/${encodeURIComponent(id)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, PublicMarketplaceSchemas.PublicShowroomSchema);
