---
name: run-batch
description: Retired ADR-0094 entrypoint; routes preserved attempts to integration recovery.
disable-model-invocation: true
---

# Retired batch entrypoint

ADR-0098 uses [Chief of Staff](../run-queue/SKILL.md) and one integration workflow. For an existing batch, preserve branch, diff, PR and evidence, then use [resume-issue](../resume-issue/SKILL.md). This pointer authorizes no batch implementation, reviewer edits or provider-usage queries.
