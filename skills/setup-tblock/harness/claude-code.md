# setup-tblock in Claude Code

Read this with [setup-tblock](../SKILL.md) when you run in Claude Code, which means you have the `Agent` tool. Pass `--harness=claude-code` on every `tiers set` and `roles set` call.

## Step 1: detect the models

The models are the `model` values the `Agent` tool lists: `opus`, `sonnet`, `haiku`, `fable`. Claude Code runs only Claude models, so only the claude tiers fill, and every panel draws from one family. A preset seats a panel from different tiers, such as `sonnet` and `opus`, and `interrogate` and `ui-council` give each reviewer its own lens, which is where the variety comes from. Say so once, in one sentence.

## Step 3a: map the tiers

Don't ask. The mapping is always the same, so write it:

```
node <tblock>/bin/tblock.mjs tiers set --harness=claude-code claude-top=opus claude-strong=sonnet claude-fast=haiku
```

Keep `fable` as `claude-top` instead when the roles file already maps it there, or the user asks for it.

## Step 6: harness files

None. The spawning skill passes `model` and `effort` to the `Agent` tool, so tblock writes no agent or settings files here.
