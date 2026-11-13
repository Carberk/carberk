// Local-only sign-in target validation and exact mock-request correlation.
export class FixtureError extends Error {}

export function codeFor(log, requestId, fixture, requestedAt, now) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId ?? "") ||
      !Number.isFinite(requestedAt) || now - requestedAt < 0 || now - requestedAt >= 240_000) {
    throw new FixtureError("Missing or stale request context; stop without resending");
  }
  const entries = log.replace(/\x1b\[[0-9;]*m/g, "").split("\n").flatMap(line => {
    const match = line.match(/\[mock\] OTP for \*\*\*(\d{4}) \(req ([0-9a-f]{8})\): (\d{6})/);
    if (!match) return [];
    const stamp = line.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/)?.[0] ??
      line.match(/\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d\d:\d\d (?:AM|PM)/)?.[0];
    let time = Date.parse(stamp);
    if (line.startsWith("{")) {
      try {
        const structured = JSON.parse(line);
        time = typeof structured.time === "number" ? structured.time : Date.parse(structured.time);
      } catch { /* malformed lines remain undated and fail closed */ }
    }
    return [{ suffix: match[1], tag: match[2], code: match[3], time }];
  });
  const matches = entries.filter(entry => entry.tag === requestId.slice(0, 8));
  if (matches.length !== 1) throw new FixtureError("Mock code missing or ambiguous for request; stop without resending");
  const entry = matches[0];
  if (entry.suffix !== fixture.phone.slice(-4) || !Number.isFinite(entry.time) ||
      Math.abs(entry.time - requestedAt) > 5000 || now - entry.time >= 240_000 || entry.time > now + 1000 ||
      entries.slice(entries.indexOf(entry) + 1).some(other => other.suffix === entry.suffix)) {
    throw new FixtureError("Mock code is unrelated, stale or superseded; stop without resending");
  }
  return entry.code;
}

export function localApi(value) {
  let url;
  try { url = new URL(value); } catch { throw new FixtureError("Use an explicit loopback API URL ending in /api/v1"); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/api/v1") {
    throw new FixtureError("Use an explicit http loopback API URL ending in /api/v1");
  }
  // Pin localhost instead of trusting name resolution or following redirects.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url;
}
