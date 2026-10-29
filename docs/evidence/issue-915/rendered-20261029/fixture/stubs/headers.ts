export async function cookies() { return { get: () => ({ value: "synthetic-access" }), set() {} }; }
export async function headers() { return new Headers({ origin: location.origin, host: location.host }); }
