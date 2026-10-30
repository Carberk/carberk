# A-09 S2 assembled verification, 2026-10-30

Candidate verification SHA: `4b2c8a6f6161f9c825945637f6f848c64adeb145`.
Source assembly commit: `10b7f68b2`. The worker started at exact base
`a4a3e9cd6dd42ea1166260c3d780ed44456f4b8b`, returned source checkpoint
`15a63bf0b29fc36d009e248fec68770c25cad5a7` and evidence-inclusive HEAD
`cee54c5615e9b50a2e265c8c2b035e823848161b`. Both cherry-picks were conflict-free.
The complete source/test/config comparison from worker evidence HEAD to the
assembled SHA exits 0. Exactly eight allow-listed admin files changed since
the S2 base; the worker seam and all worker/API/DB/contract dependencies are
unchanged. Immutable worker identity is in the dispatch ledger.

The three feature modules now require their ID/time dependencies. Both real
workspaces bind production providers and pass them to the children. Rendered
network tests exercise the real parents with literal deterministic IDs/time,
exact retry bodies and past/equal/future expiry. The prior child-only expiry
test was replaced by the parent/network test. This candidate is proposed to
close S1/S2; independent Standards review owns that disposition.

All affected checks ran serially from the coordinator checkout on the exact
candidate SHA and exited 0:

- Nine focused admin files, 334 tests passed.
- Admin TypeScript 7 and TypeScript 6.
- Admin lint.
- Admin build/runtime verification, including session smoke and standalone
  assets. The existing instrumentation Edge-runtime process.exit warning
  remains non-fatal.
- `git diff --check`.

Exact argv arrays, suite selectors, UTC start/finish times, durations, exit
codes, raw outputs, source comparison and SHA-256 hashes are in
`a-09-fix-20261030/s2-assembled/`. The worker's RED raw output was copied there
byte-exactly as `worker-red-output.txt`; setup/test expectation failures and
their resolutions remain recorded in the worker handoff.

No services, Compose projects, DB/Redis/object namespaces, ports, devices or
native builds were used. A-09's package verification slot is released. Accepted
reset-cycle, staff/API, ordinary full100 and worker static evidence is retained
because its dependencies did not change. This does not pass A-02/A-03/A-04 or
the remaining release gates.

PR #904 is separately OPEN/DRAFT on `agent/spec-897-campaign` at
`b6dac5d17c140c8fd307a24df56d4a82ed070625`, with auto-merge disabled. No PR-head
publication or merge occurred. Final acceptance must identify the later final
assembled SHA. Only the Program Parent declares A complete.
