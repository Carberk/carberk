# VPS → staging transport proof (R01)

Scope: [R01](https://github.com/Carberk/carberk/issues/1154), under the approved
[architecture proposal](https://github.com/Carberk/carberk/issues/1153). This is an
operator procedure, not a production activation or a hosting ADR. Runtime receipts
belong in the PR/issue or private temporary files, never in git. No R02 gateway or
native routing behavior is implemented here.

## Selected outbound path

Use a separate Xray process with one fixed, founder-controlled VLESS/Reality relay,
loopback HTTP CONNECT entry, and an exact HTTPS-origin allowlist. The founder
confirmed control of the existing relay. Provider identity, subscription renewal,
quota and upstream availability remain external operational dependencies; the
`jp` tag alone proves neither geography nor a provider SLA. Preserve the original
multi-outbound Xray service and its clients.

The generator copies only the selected outbound, rejects a local peer or a chained
transport, puts blackhole first, and adds no balancer, direct or Mac fallback.
The relay's fixed external IP is contacted directly; origin names pass through it
without consulting the VPS's origin DNS. HTTPS clients still validate the origin's
certificate and hostname. Never use `--insecure`, rewrite signed URLs to IPs, or
assume setting `HTTP_PROXY` makes a reverse proxy support CONNECT.

Dependencies: VPS power/network and CA/time correctness; the installed Xray binary;
relay credential/public key and remote endpoint; relay-side DNS and outbound
reachability; Railway ingress/API, MinIO photo origin and video bucket. The Mac is
an operator console, not a data-plane hop. The existing adaptive proxy is useful
for diagnostics but cannot establish route attribution.

The prepared [unit](../../../infra/egress/carberk-egress.service) uses a private
systemd credential, a dynamic user, bounded resources, and restart-on-failure.
It is **not installed or enabled by this PR**. After separately authorized installation,
it starts at boot when enabled; a crash retries after five seconds, with five starts
per minute. A persistent configuration error stops at the start limit. A relay
outage leaves the local process alive but requests fail within caller deadlines;
there is no automatic fallback. R02 must use explicit CONNECT transport and R11
must monitor origin capability rather than process uptime. Reboot availability and
long-term relay reliability are not established by a short disposable probe.

## Bounded procedure

1. Read the complete issue, comments and native blockers. Resolve the Railway
   project/environment/services with direct MCP reads. Verify staging API identity,
   public photo origin and dedicated video endpoint against current staging variables.
   Never display variable values. Keep the private operator SSH profile, peer address,
   relay secrets and real account identifiers off public GitHub.
2. Inventory listeners, owning processes, restart configuration and only sanitized
   outbound/routing fields. Do not print complete Xray config, process environments,
   packet contents or chat logs. Verify the selected outbound has no chained proxy.
   Record the source-config hash to verify it is unchanged afterward.
3. From a pnpm-installed checkout, generate disposable fixtures with the existing
   staging API environment. Use a private directory outside git:

   ```sh
   umask 077
   mkdir -p /tmp/carberk-egress-owned
   railway run --no-local \
     -p 176ddec0-dd65-4087-b82c-798599fc2ebe \
     -e 652abc79-fdb0-48b0-9f6c-ad0ff572d7b2 \
     -s 6db6f1b1-5c7a-4033-88d0-53f5f315bfc0 -- \
     node infra/egress/fixtures.cjs setup /tmp/carberk-egress-owned/manifest.json
   ```

   The helper writes a unique 4 MiB incompressible object to each existing staging
   store, issues one-hour object-scoped URLs, signs in once as an already configured
   synthetic account and creates one draft. It records ownership before writes.
   It never creates a bucket, changes policies, seeds users or publishes a Listing.
   Preserve the private manifest even if setup fails; do not retry an uncertain
   create automatically. Existing draft limits and authentication refusals stand.
4. Transfer `probe.py`, `run-isolated.py`, `relay-config.py` and a **redacted private manifest copy** to
   a unique mode-0700 VPS `/tmp` directory using the existing pinned SSH access.
   Remove `api.refreshToken` from the VPS copy. Keep its short-lived bearer and
   signed URLs mode 0600; no S3 keys, fixed sign-in codes or Railway environment
   variables go to the VPS. Confirm loopback port 11809 is free.
5. Prepare the isolated config (substitute the private source path and selected tag):

   ```sh
   python3 relay-config.py --source "$XRAY_SOURCE" --tag "$RELAY_TAG" \
     --host api-staging-2861.up.railway.app \
     --host minio-staging-5795.up.railway.app --host t3.storageapi.dev \
     --output /tmp/carberk-egress-owned/relay.json
   /usr/local/bin/xray run -test -c /tmp/carberk-egress-owned/relay.json
   ```

   Run the private config in a disposable process, never restart the original unit.
   Use a transient systemd unit with `RuntimeMaxSec=600`, `MemoryMax=192M`,
   `CPUQuota=50%` and `TasksMax=32` for the whole probe job. Use the checked-in `run-isolated.py` as that unit's command with absolute
   `--manifest` and `--config` paths. It performs direct diagnostics, two full
   relay rounds, socket attribution and stopped-relay failures, terminating only
   its child relay in `finally`. Systemd's cgroup timeout also bounds descendants
   if SSH disconnects. Always remove the private scratch directory afterward,
   including after a killed job. End the launching SSH command before collecting results.
6. Run direct read-only diagnostics, then the explicit relay:

   ```sh
   python3 probe.py --manifest manifest.json --read-only --timeout 8
   python3 probe.py --manifest manifest.json \
     --proxy http://127.0.0.1:11809 --samples 3 --timeout 45
   ```

   Optional corrected-DNS diagnostics take `--resolve-file` containing a JSON array
   of `hostname:443:public-IP` entries. Obtain fresh answers through validated DoH;
   reject non-global/synthetic addresses (including `198.18.0.0/15`). Record this
   resolver dependency separately. Overrides preserve URL hostname, Host and SNI;
   they do not alter system DNS/routes. Do not use Mac VPN fake-IP answers.

   Local DNS diagnostics use the system resolver without their own deadline.
   Run the complete procedure inside the bounded transient unit; the standalone
   CLI does not provide a total deadline if that resolver stalls.

   All requests disable redirects and implicit proxy/environment selection, retain
   TLS verification and have explicit time/size limits. Every failed HTTP/TLS/hash
   assertion makes the CLI nonzero. Storage transfers are raw bytes with SHA-256;
   the API write/read compares 1 KiB of random hex in a private draft, **not a file
   upload or full native workflow**. Requests are sequential; the three-sample run
   transfers at most 40 MiB of storage payload. This measures cold request throughput,
   not a p95, maximum capacity, concurrent-user target or actual TM phone performance.
7. During a transfer, inspect sockets belonging only to the isolated Xray PID.
   Confirm its external peer matches the chosen relay and there is no Mac-SOCKS
   connection. Stop only this relay and repeat read-only probes: they must fail,
   without fallback. Start it again and repeat the normal probe. Keep source-config
   hash and existing service/listener checks before/after. Do not stop shared Xray,
   Snikket, SSH or the founder's tunnel to demonstrate independence.
8. Always clean up via `fixtures.cjs cleanup` with the **same** explicitly scoped
   Railway command and original private manifest. It deletes only this run's two
   object keys per store and owned draft, verifies absence, and revokes its own
   session. Never clear other testers' drafts/sessions. Finish before token expiry;
   if credentials expire, retain the manifest and recover only the owned fixture
   through the supported staging API. Verify the transient unit stopped, remove its
   owned scratch directory, and retain sanitized receipts. A nonzero cleanup is an
   outstanding task, not successful completion.

## Port 443 coexistence design

Keep the existing Snikket nginx as the **only** IPv4/IPv6 port-443 listener. Add a
separate, non-default SNI virtual host for a dedicated Carberk staging hostname,
using its own certificate and a read-only persistent file mount. Its sole upstream
is the R02 gateway on loopback 11880. The [prepared ingress template](../../../infra/egress/ingress.conf.template)
contains the intended server block; its `.invalid` name and certificate paths are
explicit provisioning placeholders, not an activated endpoint.

| Listener | Owner / proposed responsibility |
|---|---|
| Existing 80/443, chat names and certificates | Existing Snikket nginx; retain all original blocks and ACME paths |
| Dedicated Carberk name on the same 443 sockets | New nginx virtual host → R02 loopback gateway |
| 127.0.0.1:11880 | R02 fixed-destination gateway; not implemented here |
| 127.0.0.1:11809 | Separate fixed-relay CONNECT process |
| Existing SSH, XMPP, TURN and Xray listeners | Unchanged |

Do not give nginx an arbitrary user-selected upstream or send signed queries to
access logs. G1 terminates client TLS across nginx/the local gateway, then validates
upstream TLS through CONNECT. The loopback hop is inside the trusted host. R02 owns
fixed origin mapping, header/authentication handling, sockets, body limits and
backpressure; this template's 16 MiB/30-second limits are a preparation baseline,
not approval of full video or WebSocket behavior.

Before any activation, prepare the exact compose override adding only this config
file and its certificate mount; use an owned DNS name and DNS-01 certificate renewal
so existing port-80 ACME behavior stays intact. Syntax-test a **scratch copy** of the
complete nginx configuration with the additional include. Never edit generated
Snikket files inside the live container. Record original container image/config and
existing hostname/health checks. Container recreation to add persistent mounts is
an existing-service change: obtain concrete rollout approval for that exact diff
and its short interruption only after R02 upstream and certificates are ready.

Then test all existing chat hostnames, uploads, XMPP/TURN and management access,
as well as Carberk TLS and origin reachability. A broken Carberk upstream should
fail only its virtual host. A broken nginx config/restart affects both services,
so this is a shared ingress failure domain. Roll back by removing only the additive
mounts/virtual host and restoring the recorded compose state; never change SSH,
firewall, authorized keys or routes. No second server can bind the already-owned
443 sockets safely, and no extra IP, relay subscription or purchase is assumed.

## Reference behavior

- [Xray routing](https://xtls.github.io/en/config/routing.html): `AsIs`, exact domain
  rules and default-first-outbound behavior. Validate with the installed binary.
- [nginx server names](https://nginx.org/en/docs/http/server_names.html): distinct
  name-based virtual hosts sharing listener sockets.
- [nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html):
  request buffering, explicit headers, timeouts and disabling upstream retry.
- [Snikket reverse proxies](https://snikket.org/service/help/advanced/reverse_proxy/):
  Snikket also supports moving web ports behind a separate proxy. That is unnecessary
  for the selected additive design and is not authorized as a test convenience.
