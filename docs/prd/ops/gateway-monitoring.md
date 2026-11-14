# Closed staging gateway monitoring and preference rollback

[The foundation](https://github.com/Carberk/carberk/issues/1259) keeps monitoring
local to the gateway. [R11](https://github.com/Carberk/carberk/issues/1164) retains
durable API/photo/video monitoring through the actual merged media mappings.
Neither sends external messages or depends on the broader diagnostics platform.
The [gateway runbook](staging-gateway.md) owns transport, signing and ingress.
Production changes require a separate approved rollout.

## Signals

`monitor-metrics.mjs` passively observes the gateway HTTP server. Its periodic
`gateway_metrics` record contains fixed route buckets, active/completed requests,
server failures, client denials, interrupted responses, total/maximum duration,
and active no-progress transfers. A stall means no observed request/response
stream progress for ten seconds; it can include an origin waiting for a response.
Each stall episode is counted once. Socket indicators describe incoming
connections/upgrades; they do not imply an authenticated chat connection.
Resource indicators include process RSS/cumulative CPU microseconds, host free and
total memory, and one-minute host load. Cumulative counters reset on process restart.
These are operational indicators, not latency percentiles or a capacity claim.

Never add targets, query strings, headers, IPs, error messages or body contents to
these records. Observe the journal through an authenticated operator session.
Metrics and probes grant no User permissions.

## Independent path probe and alarm

`monitor-probe.mjs` runs in a separate supervised process. It sends GET requests
through the actual gateway entry to API readiness and two synthetic media
canaries. It validates API readiness JSON and exact media SHA-256 values, refuses
redirects, bounds each request to four seconds, and caps response data at 64 KiB
for readiness and 1 MiB for media. API, photo and video results remain separate.
No canary is raw user content. The process emits `gateway_probe` with fixed route,
health, reason category and duration, never request details or body bytes.
An absent media target reports unhealthy with reason `unconfigured`; it never
prevents the API check or implies a working media path. Zero traffic counters are
not evidence of health. The one-shot command fails until all three paths pass.
Two consecutive failures emit `gateway_alarm` with `state: firing`; the first
healthy observation emits `state: recovered`. An unavailable gateway process
therefore cannot hide its failure by ceasing its own logs.

The root-private mode-0600 manifest `/etc/carberk/monitor.json` has this shape;
all values below are placeholders:

```json
{
  "baseUrl": "https://gateway.example.test",
  "accessKey": "provisioned privately",
  "targets": {
    "api": { "path": "/readyz" },
    "photo": { "path": "/fixed-photo-alias/synthetic-canary", "sha256": "64 lowercase hex characters" },
    "video": { "path": "/fixed-video-alias/synthetic-canary", "sha256": "64 lowercase hex characters" }
  }
}
```

An optional media `range` requires HTTP 206 and the hash of those exact bytes.
Never put access details or signed queries in commands, URLs in receipts, git or
public issues. Do not provision S3 signing credentials on the VPS. Short-lived
canary grants require fresh private manifests; expiry is a failure, not proof
that the transport is broken. A continuously supervised signed canary needs an
approved grant-renewal owner before it can claim durable media coverage. Do not
install an expiring static video grant as permanent monitoring configuration.

Run `node monitor-probe.mjs PRIVATE_MANIFEST --once` for a bounded check (exit 1
on any unhealthy path). Without `--once`, it checks every fifteen seconds after
the prior round. The separate systemd unit uses `LoadCredential`; restart only
that new unit after changing its manifest to refresh the credential snapshot.
Observe its journal and service status. Test a controlled alarm by changing only
an owned synthetic canary checksum in a disposable manifest, observing firing,
then restoring the exact original and observing recovery. Never stop shared
origins or alter nginx/relay configuration to manufacture an alarm.

## Preference disable, restore and limits

Bearer-authenticated `GET /api/v1/routing/policy` returns
`{version:1,disableTmPreference:boolean,maxAgeSeconds:60}` with
`Cache-Control: private, no-store` through both fixed entries. The API startup
setting `ROUTING_DISABLE_TM_PREFERENCE` accepts only `true` or `false`, defaulting
to `false`. Operators change it with authenticated Railway staging configuration;
there is no client secret or operator-write endpoint.

R10 owns consumption: monotonic lifetime at most sixty seconds from request
start; failed, invalid or unauthorized refresh never extends stale policy.
Embedded endpoints/local reachability remain available before sign-in and after
expiry. Disable changes preference only. Healthy TM remains an alternative when
Global is unreachable. Policy cannot grant authority, replay a write, clear a
session or restart a pinned transfer. Restoring configuration cannot make an
unreachable Global path usable.

Before a coordinated staging rehearsal, capture fresh service/environment IDs,
current deployment and serving revision, setting presence and exact old value
privately. Prepare apply and rollback before mutation. Parent owns the API window.
Set only the preference setting, observe SUCCESS for that exact deployment,
verify revision health, then prove authorized read and missing/invalid bearer
denial over both entries. Restore the prior setting (including absence), observe
the exact restore deployment SUCCESS/revision health, and repeat both-entry proof.
Wait for signed-attribution startup quarantine to expire; do not disable it.

For a gateway source/config upgrade, save exact current files, hashes, modes,
service identity and revision first. Preserve reverse transport, signer and
existing original relay. Restore only this ticket's files/config and restart only
its isolated service in the coordinated window. Never run the initial installer's
whole-install rollback. No nginx, Snikket, Xray, firewall, DNS or host reboot is
part of this procedure. Record bounded sample counts, vantage, fault and recovery;
these observations do not establish TM handset performance or R12 load targets.
