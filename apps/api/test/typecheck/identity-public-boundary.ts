// Compile this consumer with the API's configured typecheck. Each directive
// becomes TS2578 if Identity exposes refresh state again.

// @ts-expect-error Session is private to Identity, including refreshTokenHash.
export type { Session as ForbiddenSession } from "../../src/modules/identity/identity.public";

// @ts-expect-error Session writes are private to Identity.
export type { SessionRepository as ForbiddenSessionRepository } from "../../src/modules/identity/identity.public";

// @ts-expect-error The internal repository must have no public injection token.
import type { IDENTITY_SESSION_REPOSITORY } from "../../src/modules/identity/identity.public";
export type ForbiddenSessionToken = typeof IDENTITY_SESSION_REPOSITORY;

// Listings legitimately consumes the clock contract across this boundary.
export type { ClockPort as RetainedClock } from "../../src/modules/identity/identity.public";
import type { IDENTITY_CLOCK_PORT } from "../../src/modules/identity/identity.public";
export type RetainedClockToken = typeof IDENTITY_CLOCK_PORT;
