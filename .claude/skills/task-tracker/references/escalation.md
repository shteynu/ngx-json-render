# Role or model escalation — procedure

Open this file only when a trigger from the `Escalation` section of
[../SKILL.md](../SKILL.md) has fired. Until then the policy is silent and
there is nothing here to apply.

## Steps

1. Finish the current safe bounded step first. An unfinished step makes the
   recommendation useless: the next agent cannot tell where you stopped.
2. Update the task file: findings, residual risk and one
   `Next concrete step`.
3. Recommend exactly one action:
   - continue with the current agent;
   - bring in a `strong reasoning model` role;
   - bring in an `independent reviewer` role;
   - split independent work across branches or worktrees.

Do not switch models automatically. Do not assert a model's availability,
superiority or remaining usage without evidence from the client.

## Output format

Do not add complexity scores, token estimates, model tables or comparisons of
commercial models. They look like measurement, but none of them was measured
here. Output only:

```text
Model recommendation: <one action>.
Reason: <one sentence>.
Handoff: <task file and next step>.
```

## Task-file block

Only on a real escalation, add:

```md
## Agent recommendation

- Recommended role:
- Reason:
```
