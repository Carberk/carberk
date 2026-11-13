# Closed staging API gateway (R02)

[R02](https://github.com/Carberk/carberk/issues/1155) adds a controlled-client API
entry on the VPS. [R01](staging-egress.md) owns fixed-relay selection and its
independence proof. This release forwards only the staging API: media-origin
mapping, native route selection and sockets remain separate tickets. R03 adds
optional signed client attribution as described below. A gateway key does not grant API business permissions.

## Runtime contract

`infra/gateway/serve.mjs` reads a private JSON file containing `origin`, `proxy`,
`hostname` and a random `accessKey` of at least 32 characters. Its CLI permits only
the staging API origin and the isolated loopback CONNECT proxy. The configured
hostname must match the request Host. A client supplies `X-Carberk-Gateway-Key` in
addition to its normal API bearer token. Never put the gateway key in a URL, git,
logs or a public build. Generate it into a mode-0600 file in a private directory.

nginx terminates validated client TLS on the dedicated SNI hostname and streams
to loopback port 11880. The gateway uses an explicit HTTP CONNECT tunnel on
loopback 11809 and validates the fixed API origin's TLS hostname/certificate.
The [runtime pin](../../../infra/gateway/runtime.json) identifies the official
Linux x64 Node archive and SHA-256. There are no npm runtime dependencies.

Allowed targets are `/healthz`, `/readyz`, and `/api/v1/…`; CONNECT, WebSocket
upgrade, absolute-form destinations and unconfigured paths are refused. The raw
request target, method, body and ordinary API status are preserved. Hop-by-hop
headers, caller-supplied forwarding metadata and the gateway key never reach the
API. API bearer tokens go only to that fixed origin. External/invalid redirects
produce 502; approved same-origin redirects become relative gateway paths. The
gateway follows no redirects and retries no request. An interrupted response
stays interrupted, rather than ending a truncated body as a successful transfer.

Requests have a 30-second total deadline, six-second CONNECT/TLS budget, 16 MiB
upload limit and 16 concurrent-request limit. Streaming uses backpressure and
bounded stream buffers, with no durable body spool/cache. The upstream agent
counts CONNECT/TLS attempts within its eight-connection limit and keeps at most
four free. Cancelling a client closes its pending transport; cancelled queued
requests retain admission slots until cleanup and never initiate a later tunnel.
nginx also disables request/response buffering, gzip transformation and upstream retry. Logs contain
only method category, status, outcome and duration; never targets, headers or bodies.

Without R03 signing enabled, Railway sees the relay's ingress address. Do not increase trusted hop
counts or accept unsigned forwarded metadata to compensate. Until later media and
socket tickets, the API-only entry must stay restricted to controlled clients.

## Prepare before approval

1. Read the issue/parent, native blockers and current [environment authority](../../agents/environment.md).
   Confirm the VPS listeners, existing nginx configuration, source relay and staging
   API identity. Keep machine addresses, SSH access details and keys private.
2. Provision a dedicated hostname under an already-owned domain. Obtain a trusted
   certificate using DNS-01 so port 80 and Snikket's existing ACME paths remain
   unchanged. Use a separate certificate directory. Never replace the chat
   certificate or disable validation. If using manual DNS, record expiration and
   an operator renewal deadline; manual Certbot certificates do **not** renew
   automatically without a DNS authentication hook.
3. Download the archive in `runtime.json` from the official Node release and verify
   its checksum locally and again on the VPS. Extract it into an owned `/tmp`
   runtime directory, keeping the archive as `node.tar.xz`. Copy `runtime.json`,
   `gateway.mjs`, `serve.mjs` and `operate.py` there. Create the private `gateway.json`.
4. Generate `relay.json` into that directory with R01's `relay-config.py`, allowing
   **only** the configured staging API hostname. Never modify the existing Xray
   service to obtain a convenient path. Keep both JSON files mode 0600.
5. Prepare another private directory containing both service units, `gateway.conf`,
   `docker-compose.override.yml`, and `tls/fullchain.pem` plus `tls/privkey.pem`.
   Render [the ingress template](../../../infra/egress/ingress.conf.template) with
   the owned hostname and certificate paths under `/snikket/carberk-staging-tls/`.
   The override contains only:

   ```yaml
   services:
     snikket_proxy:
       volumes:
         - /etc/carberk/gateway.conf:/etc/nginx/conf.d/carberk.conf:ro
   ```

   Refuse an existing default compose override or managed destination; do not
   overwrite another operator's files. Syntax-test the complete nginx candidate
   using a scratch main config with an additional include and the real new
   certificate. Validate the merged compose config without recreating containers.
6. Run the gateway and relay in bounded disposable units first. Observe actual
   staging identity through the gateway, stop only the disposable relay to obtain
   502, and restart it to obtain success. This loopback proof is preparation,
   **not final client-TLS or port-443 proof**. Stop these units before activation.
7. Prepare the exact apply/rollback plan, including all paths and the graceful
   nginx reload. Obtain explicit existing-service approval before activation.

## Apply and verify

The [operator](../../../infra/gateway/operate.py) supports only an **initial**
installation and rollback to its prior absent state. It refuses an existing managed
installation. Later upgrade work must prepare its own replacement/rollback plan.
Run as root, passing the two prepared directories:

```sh
python3 operate.py check
python3 operate.py apply --prepared /tmp/OWNED-prepared --runtime /tmp/OWNED-runtime
```

It adds only `/etc/carberk`, `/opt/carberk-gateway`, two `carberk-*.service` units,
the owned certificate subdirectory and the single compose override. It copies the
new virtual-host file into the running container, validates nginx, enables the new
units, gates on actual staging readiness, and gracefully reloads nginx. Only the
side-effect-free readiness GET retries within a bounded budget. Existing nginx
workers continue serving during preparation; the container is not recreated.
The override persists the file mount for subsequent normal compose recreation.

Use the same compose base plus the override for future recreation; deliberately
running only the base with `-f` would omit the gateway mount. A Docker/host restart
of the current container retains its writable-layer config. Do not claim that a
short proof establishes reboot endurance or production availability.

On the actual hostname and **443**, prove:

- ordinary certificate/hostname validation succeeds without `--insecure`;
- missing/wrong gateway key is denied, while ordinary API 401/403 remains denied;
- a synthetic bearer-authenticated request can write/read an owned draft;
- method/raw target/body/status and upstream TLS match the tested contract;
- stopping only the new egress unit produces truthful failure, followed by recovery;
- existing chat HTTPS endpoints/listeners and original service configuration remain
  intact before and after reload, rollback and reapplication.

Supply secrets through private request files or stdin, never command arguments or
public receipts. The founder's normal Wi-Fi may need per-request interface/DNS
selection; do not change global routes or VPN settings. Signed-in native workflows,
video/photo routing and trustworthy client attribution are not R02 proof.

## Rollback and cleanup

```sh
python3 operate.py rollback
```

The operator checks container identity and recorded file hashes before removing the
owned virtual host, testing/reloading nginx and stopping/removing only the two new
units and managed files. It restores the prior absent gateway; DNS remains owned
and can be retained. If the ingress container or managed resources changed, it
refuses and preserves them for review. Never use force deletion to bypass that
refusal. A partial installation retains `install-state.json`; inspect it and resolve
only this attempt's files before retrying. Do not assume a failed command changed
nothing, or repeatedly replay an uncertain apply.

Rehearse rollback, verify original services, then reapply the same closed staging
candidate if authorized. Remove disposable test drafts/sessions, temporary units,
ACME challenge records, copied ACME account material and staging scratch directories
only after public TLS and owned cleanup are verified. Retain sanitized receipts in
the issue/PR and the private operator credential needed by later controlled tests.
Certificate renewal updates only the owned pair, validates nginx and gracefully
reloads; it needs the same existing-service authority as activation.

## References

- [Node 24 HTTPS](https://nodejs.org/docs/latest-v24.x/api/https.html): agents and TLS.
- [Node TLS](https://nodejs.org/docs/latest-v24.x/api/tls.html): validated TLS over a Duplex transport.
- [Node streams](https://nodejs.org/docs/latest-v24.x/api/stream.html): backpressure.
- [Node release checksums](https://nodejs.org/dist/v24.13.0/SHASUMS256.txt).
- [nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

## Signed client attribution (R03)

The optional private gateway `signing` object contains `keyId` (1–32 ASCII
letters/digits/underscore/hyphen) and `secret` (32 random bytes as 64 lowercase
hex characters). Use a separate secret from `accessKey`, TLS and API bearer keys.
The API's private `GATEWAY_ATTRIBUTION_KEYS` is a JSON object mapping at most four
key IDs to these secrets; `{}` disables verification and rejects any presented
proof. Direct requests keep the existing Railway `X-Real-IP` policy and hop count.
Never send this configuration to a public issue, command argument or log.

The gateway listens only on loopback. The existing nginx virtual host overwrites
`X-Real-IP` with `$remote_addr`; do not enable real-IP rewriting from untrusted
headers. Signing requires that single valid address and a loopback peer. Caller
`X-Carberk-*`, forwarding and Cloudflare metadata are stripped before rebuilding
`X-Carberk-Client-Proof`. A missing/malformed observed address fails with 400.
The header is `v1.<keyId>.<unixMillis>.<nonceHex>.<ipBase64url>.<hmacHex>`.
The nonce is 16 random bytes. HMAC-SHA256 uses the binary hex-decoded secret over
`<first five dot-separated fields>\n<METHOD>\n<raw request target>`, encoded as
UTF-8, with no trailing newline. Query order and percent-escape spelling matter.
The proof authenticates the observed IP and transport request, never a User or
business permission. Bearer authorization still applies. Country headers have no
authorization or rate-limit meaning.

The API hook runs before parsing bodies, guards and controllers. It checks shape,
key membership, valid IP, constant-time MAC equality, at most 30 seconds of age
and at most five seconds in the future. Any malformed/unknown/forged proof or
additional `X-Carberk-Client-*` field returns 403, without direct-header fallback.
Valid proofs atomically claim `carberk:gateway-proof:v1:<keyId>:<nonce>` in the
API's shared Redis using `SET NX PX 35001`. Reuse returns 403 across API instances.
The same normalized IP feeds both the global and Sign-in Code budgets. Two real
clients behind one NAT still share its observed address, as direct clients do.

Redis commands have a one-second timeout, no offline command queue and no request
retry. Redis failure returns sanitized 503 for gateway requests; direct requests
continue. Each API Redis connection/reconnection quarantines signed requests for
35,001 ms so proofs potentially forgotten by a Redis restart/restore expire first.
API restarts therefore also have a short signed-entry warmup; a gateway health
probe truthfully sees 503 during it. Keep clocks synchronized. Never flush replay
keys while APIs remain connected: stop the signer and wait at least 35,001 ms, or
restart all API verifier connections to rearm quarantine. This cache is transient
security state, not a second business dataset.

Rotation: provision a fresh key/ID in the API key ring, deploy and wait for the
connection warmup, then replace the gateway's private signing object atomically
and restart only its isolated service. Keep the previous verification key through
all old gateway instances stopping and the 35,001 ms acceptance window, then remove
it from the API. Never reuse an ID with a different secret during overlap. Removal
immediately rejects that key; treat compromise as revocation, not graceful overlap.
Gateway restarts create fresh random nonces; they never replay requests. Gateway
and API ordinary logs omit original client addresses and proofs; provider edge
access logs have a separate retention/configuration boundary.

### Closed-staging upgrade and rollback

R02's installer intentionally refuses upgrades. Before an upgrade, privately save
`/etc/carberk/gateway.json` and the installed `gateway.mjs`/`serve.mjs`, record their
hashes/modes, service identity, nginx config hash and live health revision. Prepare
both replacement and exact rollback files before changing anything. This release
requires no nginx, certificate, relay, firewall, global route or Snikket change.

Deploy the API verifier with the staging-only key ring first; verify direct
readiness and wait for warmup. For a bounded pre-activation test, run a disposable
loopback gateway from an owned `/tmp` directory through the existing fixed relay,
with the candidate signer and synthetic observed addresses. Prove separate buckets,
forged proof rejection, bearer denial, replay rejection and recovery without logging
IPs. Stop only the disposable process and remove its private key copies afterward.

Activation of the running closed gateway is a separate, concrete operator action:
validate the replacement private config with `serve.mjs --check`, atomically replace
only the two gateway source files and private config, restart only
`carberk-gateway.service`, and prove real hostname/443 TLS, bearer denial, forwarding
and unchanged existing-service/configuration hashes. Obtain existing-service
authority if the prepared change affects shared production services. Do not infer
production Carberk rollout authority from this staging procedure.

Rollback restores the two saved gateway files and private configuration, restarts
only the gateway service and verifies original 443 health. Then remove the added
staging API verification key if desired. API code with an empty key ring retains
direct/R02 behavior; signed requests are rejected. Keep the replay namespace intact
through rollback. Do not run R02's whole-install rollback for a signer-only upgrade.
