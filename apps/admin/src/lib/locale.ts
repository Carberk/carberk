import { cookies } from "next/headers";

import { normalizeAdminLocale } from "./messages";

export async function getAdminLocale() {
  return normalizeAdminLocale((await cookies()).get("carberk_admin_locale")?.value);
}
