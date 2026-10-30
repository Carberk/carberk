# A-10 current PR and candidate read-back — 2026-10-30

This is a current ref read, separate from the earlier fast-forward receipt.

| Ref | Exact value | Meaning |
| --- | --- | --- |
| Coordinator branch `agent/release897-candidate-a-20261029` | `998e2cfa47a7c33ffd097ea0ffb07e36aaaa5284` | Current internal candidate |
| PR #904 branch `agent/spec-897-campaign` | `b6dac5d17c140c8fd307a24df56d4a82ed070625` | Selected integration ref |
| PR state | open, draft | Merge remains blocked |

Commands used:

```text
gh pr view 904 --repo Carberk/carberk --json headRefName,headRefOid,baseRefName,state,isDraft,url
git rev-parse HEAD
git ls-remote origin refs/heads/agent/release897-candidate-a-20261029 refs/heads/agent/spec-897-campaign
```

The two refs are intentionally recorded separately. This read-back does not
publish, merge, or claim final acceptance.
