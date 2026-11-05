# Models and effort

The founder has more GPT Sol 6.1 quota than Claude Opus 5.5 quota, so agents lean on Sol. This holds until the founder changes this page.

## Default model

Use GPT Sol 6.1 (`gpt-6.1-sol`, on the Codex provider) for agent work: implementation, research, `sol-loop` review, `babysit-pr` fixes and other delegated tasks. When a newer Sol appears, keep 6.1 until this page names the new one.

Use Claude Opus 5.5 (`claude-opus-5-5`) only as a `council` member, or when the founder names Opus for a task. An Opus session the founder starts stays on Opus, but it sends delegated implementation, research and review to Sol through `delegate_task` instead of starting Opus subagents.

In T3 Code, `orchestrator_capabilities` lists the providers, model IDs and option names. If Sol is unavailable, say so and ask; do not switch to another model on your own.

## Effort

| Work | Sol 6.1 effort |
|---|---|
| Lookups, simple research, mechanical edits | `low` |
| Implementation, `sol-loop` review, `babysit-pr` fixes | `medium` |
| Auth, permissions, migrations, data deletion, payments, concurrency | `xhigh` |
| `council` member | `high` |

Sol's option is `reasoningEffort`, Opus's is `effort`. Do not use `max`, `ultra` or higher, Fast mode, or the `priority` service tier unless the founder asks.

## Council

`council` uses three members at `high` effort:

- GPT Sol 6.1 (`gpt-6.1-sol`, Codex)
- Claude Opus 5.5 (`claude-opus-5-5`, Claude)
- Muse Wonder 1.0 (`muse-wonder-1.0`, Muse Code)

If Opus or Muse is unavailable, run with the members you can reach and name the missing ones in the result. Sol is required.
