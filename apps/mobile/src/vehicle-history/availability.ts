/** Public information is usable only in an explicitly enabled local synthetic build. */
export function vehicleHistoryAvailable() {
  if (process.env.EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC !== "true" ||
      process.env.EXPO_PUBLIC_ENV !== "development") return false;
  try {
    const api = new URL(process.env.EXPO_PUBLIC_API_URL ?? "");
    return api.protocol === "http:" && !api.username && !api.password &&
      ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname);
  } catch {
    return false;
  }
}
