export const ADMIN_SESSION_ELEVATION_PORT = "IDENTITY_ADMIN_SESSION_ELEVATION_PORT";

/** Readonly admission result; Session and refresh state stay inside Identity. */
export type AdminSessionElevationResult =
  | "elevated"
  | "session-required"
  | "session-expired"
  | "elevation-expired";

export interface AdminSessionElevationPort {
  /** Checks ownership before deadlines; samples time once after session lookup. */
  check(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<AdminSessionElevationResult>;
}
