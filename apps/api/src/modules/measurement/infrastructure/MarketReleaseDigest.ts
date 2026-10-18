import { createHash } from "node:crypto";
/** Source fences and cells cross PostgreSQL JSONB, which does not preserve object property order. */
export function marketReleaseDigest(value:unknown):string {
 return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
