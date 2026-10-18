# Synthetic diagnostics runtime preparation

This profile is closed unless `synthetic-diagnostics` is selected. Nothing is provisioned by adding this file. It has no published ports and its isolated network denies collector internet egress. It must not be attached to the core database, core object bucket or core backup policy. Use separately generated collector credentials. No billing, messages or collection are authorized by the manifest.

The pinned GlitchTip 6.2.6 image uses django-vtasks. Its separate `web` and `worker` roles are intentional. Run the one-off `migrate` service against only this collector database before starting those roles. Operator bootstrap must be performed privately with registration disabled. There are no default credentials. PostgreSQL 18 stores its versioned data directory under the `/var/lib/postgresql` mount.

An admitted HTTPS reverse proxy on the isolated network must expose only the intended private operator routes and relay ingestion. No proxy or public hostname is provisioned here. The first-party diagnostic relay requires validated HTTPS, refuses redirects, and holds the project ingestion key on the server. Never publish a collector DSN or operator token in mobile/web environment variables. The core relay must remain disabled until its synthetic Session allowlist, expiry and exact candidate manifest are configured.

Web and worker each have 0.5 CPU, 384 MiB RAM, bounded temporary storage, 128 PIDs and rotated logs. The database has a separate 512 MiB bound. These are proposed burst-test settings, not measured requirements or enforced Railway limits. The one-off migration must not run concurrently with acceptance traffic. Run the watchdog in its own separately bounded service via `pnpm --filter @auto-tm/worker start:watchdog`, outside both the worker and collector. Its monitored disk path must mount the actual intended filesystem.

Retention is configured for 30 days and logs, replay-related collection, uptime, MCP and cold archival are disabled. Source artifact and compressed archive limits differ intentionally. Operator source artifact uploads are private and independently bounded. Collector scrubbing is defense in depth after first-party allowlisting, never proof that prohibited fields were not cached on a native device.

Acceptance still requires actual image startup, migrations, private TLS routing, collector receipt, exact-release symbolication, scheduled retention execution, deletion/restore epoch fences, bounded backlog under outage, hard volume quota and resource saturation isolation. Compose memory limits do not bound database/file volume growth. No actual disk quota or provider billing is claimed. Do not include these disposable telemetry volumes in core recovery backups. A restore must start with capture disabled and rotated collector credentials/epoch before admission is restored.

Sources reviewed on 2026-10-18:

- https://glitchtip.com/documentation/install/
- https://gitlab.com/glitchtip/glitchtip-backend/-/blob/v6.2.6/glitchtip/settings.py
- https://gitlab.com/glitchtip/glitchtip-backend/-/blob/v6.2.6/bin/start.sh
- https://hub.docker.com/v2/repositories/glitchtip/glitchtip/tags/6.2.6
- https://hub.docker.com/v2/repositories/library/postgres/tags/18.6-alpine3.23
- https://github.com/docker-library/docs/blob/master/postgres/README.md
