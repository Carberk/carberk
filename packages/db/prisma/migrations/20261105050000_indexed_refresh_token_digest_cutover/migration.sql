-- Founder-approved one-time reauthentication: bcrypt-only token verifiers
-- cannot be converted to deterministic digests without the plaintext tokens.
-- Keep the existing unique hash index; the new API never scans legacy rows.
DELETE FROM "sessions";
