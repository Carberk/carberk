# Public web

The public site provides a localized landing page, legal pages, trust information, and the public account deletion page. Anonymous Listing and showroom readers use a narrow public API projection, fetch current lifecycle state without caching, and render supported locales without an install wall. Listing contact remains scoped to the active Listing. Suppressed or unavailable data returns an unavailable page; the public read boundary excludes private service evidence. Blog routes remain absent. Use the route tree to establish shipped pages; roadmap descriptions do not establish implementation.

`/healthz` is dependency-free and bypasses locale routing. The standalone production image uses Next.js output tracing at the monorepo root. Preserve deployment identity in health responses.

The account deletion page, `/[locale]/account/delete`, is Google Play's deletion link; the bare `/account/delete` redirects to a locale. The API has no CORS, so the browser never calls it directly: the form calls Server Functions, which call the public `account-deletion` endpoints through `src/lib/account-deletion.ts` with the shared contract schemas. Every message after a request must stay true whether or not a User holds the value, so the page reveals no more than the API. Server-side API calls use `API_BASE_URL`, then `NEXT_PUBLIC_API_URL`, the same order as admin. `API_BASE_URL` must be the private origin: through the public edge, the edge overwrites web's forwarded address and every visitor shares one budget. Web forwards the visitor's address to the API, and the API's per-IP Sign-in Code budget counts it. `src/lib/visitor-ip.ts` reads it with the API's rule (`CLIENT_IP_HEADER`, default the `X-Real-IP` that Railway's edge sets, and `CLIENT_IP_TRUSTED_HOPS`) and never falls back to a visitor-written `X-Forwarded-For`; with no usable value web forwards nothing and the API counts web's own address. Web sends it in `API_CLIENT_IP_HEADER`, default `X-Real-IP` ([ADR-0078](../../docs/adr/0078-the-api-trusts-one-configured-header-for-the-client-ip.md)). Any other ingress must set or overwrite the configured header, or visitors can choose their own budget.

Legal canonical links read runtime `WEB_BASE_URL`, matching mobile's `EXPO_PUBLIC_WEB_URL` for the deployment. Privacy, terms and posting rules render on demand so promoting an image does not preserve the prior environment's canonical host. Set `WEB_BASE_URL` to the custom public web origin; when absent it falls back to `RAILWAY_PUBLIC_DOMAIN`, then local development at port 3002. Every Posting rule must map to a publish check, media limit, Listing report reason or moderation action the product enforces; its content spec pins those rules.

Web shares browser components and theme tokens with `packages/ui`; mobile has separate native components. User-facing text must remain available in the supported locales.

Public diagnostic readers under `/[locale]/diagnostics/[id]` use the separate anonymous report projection and always fetch current access without caching. Known private IDs stay unavailable. Same-origin PDF and evidence routes reauthorize each request, refuse redirects and validate binary type/size before returning private no-store responses. Listing detail shows a neutral report-availability action only when that projection permits it. Synthetic release gates do not authorize a real diagnostic service.

## Start here

- [Pages and route handlers](src/app)
- [Locale routing](src/middleware.ts)
- [Build configuration](next.config.ts)
- [Production image](../../infra/docker/web.Dockerfile)
- [Account deletion page](src/app/[locale]/account/delete)
- [Shared UI](../../packages/ui/CONTEXT.md)

The marketplace association routes under `.well-known` require configured actual application/signing identities. `api/marketplace-sharing` remains disabled until deployed reader and installed-link acceptance is recorded through its explicit activation input. See [public reader evidence](../../docs/evidence/issue-910/readers-and-sharing.md) for inputs and outstanding acceptance; generated application identities are never a substitute for deployed signing evidence.
