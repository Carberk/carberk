# ADR-0111: Indexed refresh-token digests and one-time reauthentication

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Founder
- **Supersedes**: ADR-0012's bcrypt storage and token-lookup mechanism only

## Context

Refresh and logout currently load every Session and bcrypt-compare each verifier. Invalid requests perform work proportional to all Sessions, including expired rows. Tokens already contain 32 cryptographically random bytes encoded as 64 hex characters. The database already has a unique index on `Session.refreshTokenHash`.

Bcrypt-only verifiers cannot be converted without their plaintext tokens. The founder explicitly chose one-time reauthentication instead of preserving a legacy scan window in issue #993.

## Decision

Carberk stores the SHA-256 digest of each existing-format, 32-byte random refresh token in `Session.refreshTokenHash` and looks up that digest through the existing unique index. The cutover uses a forward data migration deleting pre-cutover Sessions. There is no bcrypt scan fallback. Random generation, rotation compare-and-swap, expiry, multi-device limits, ownership, suspension and admin elevation policies remain unchanged.

This choice applies to high-entropy random bearer tokens, never passwords or Sign-in Codes. ADR-0012 remains effective except for bcrypt storage and lookup.

## Consequences

### Positive

- Invalid refresh and logout requests perform one indexed token lookup, without bcrypt or unrelated-row verification.
- No new table, nullable legacy field, selector format, index or client token-format migration is needed.
- Rotation retains its existing one-winner compare-and-swap predicate.

### Negative / accepted costs

- Every existing Session is removed at deployment cutover; users must sign in again when renewal is needed. Admin elevation tied to those Sessions is lost.
- Issued access JWTs retain their existing validity until expiry (normally 15 minutes); this change does not add JWT revocation checks.
- The data migration is irreversible. Restoring old Sessions or plaintext tokens is impossible. Rolling back to the old bcrypt binary also makes newly issued digest tokens unusable and requires reauthentication; prefer a forward fix after cutover.
- Mixed old/new API instances must not be used as a compatibility strategy: each verifier format is deliberately unsupported by the other version.

### Neutral

- Client refresh-token shape and secure storage remain unchanged. Database expiry/eviction and logout policies retain their current meaning.

## Alternatives considered

- **Indexed digest plus bcrypt fallback** — rejected because invalid legacy-shaped requests retain the full scan until sunset.
- **Selector.secret tokens** — valid, but add token-format and schema changes that the existing digest index makes unnecessary here.
- **Keep bcrypt and optimize scans** — rejected because it retains total-session-dependent verification work.

## References

- https://github.com/Carberk/carberk/issues/993 and its founder cutover decision.
- ADR-0012: Multi-device sessions.
- https://www.rfc-editor.org/rfc/rfc6819.html — CSPRNG bearer-token entropy guidance.
- https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14 — refresh-token rotation and replay guidance.
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html — random, securely stored, expiring tokens.

External references accessed 2026-11-05. Index row: `0111 | Indexed refresh-token digests and one-time reauthentication (supersedes ADR-0012 hashing/lookup only) | Accepted | 2026-11-05`.
