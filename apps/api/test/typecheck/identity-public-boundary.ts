// Compile this consumer with the API's configured typecheck. Each directive
// becomes TS2578 if Identity exposes refresh state again.
import type * as Identity from "../../src/modules/identity/identity.public";

// @ts-expect-error Session is private to Identity, including refreshTokenHash.
export type ForbiddenSession = Identity.Session;

// @ts-expect-error Session writes are private to Identity.
export type ForbiddenSessionRepository = Identity.SessionRepository;

// @ts-expect-error The internal repository must have no public injection token.
export type ForbiddenSessionToken = typeof Identity.IDENTITY_SESSION_REPOSITORY;

// Listings legitimately consumes the clock contract across this boundary.
export type RetainedClock = Identity.ClockPort;
export type RetainedClockToken = typeof Identity.IDENTITY_CLOCK_PORT;
